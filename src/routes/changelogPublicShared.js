const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const Filter = require('bad-words');
const fileStorage = require('../services/fileStorage');
const settingsService = require('../services/settings');
const emailService = require('../services/emailService');

const filter = new Filter();

async function syncVoteCounts(changelogId) {
  await pool.execute(
    `UPDATE changelogs SET 
      upvote_count = (SELECT COUNT(*) FROM votes WHERE changelog_id = ? AND vote_type = 'upvote'),
      downvote_count = (SELECT COUNT(*) FROM votes WHERE changelog_id = ? AND vote_type = 'downvote')
     WHERE id = ?`,
    [changelogId, changelogId, changelogId]
  );
}

async function loadTranslationIfAny(changelog, locale) {
  if (!locale || !changelog) return;
  const [rows] = await pool.execute(
    'SELECT title, body FROM changelog_translations WHERE changelog_id = ? AND locale = ?',
    [changelog.id, locale]
  );
  if (rows.length) {
    changelog.title = rows[0].title;
    changelog.body = rows[0].body;
  }
}

async function listChangelogs(req, res, projectId) {
  try {
    const { page = 1, limit = 10, label, locale } = req.query;
    const offset = (page - 1) * limit;
    const showAuthor = await settingsService.getSetting('show_changelog_author_username', false);

    let whereClause = 'WHERE c.status = ? AND c.project_id = ?';
    const params = ['published', projectId];

    if (label) {
      whereClause += ' AND c.label = ?';
      params.push(label);
    }

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total FROM changelogs c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const authorSelect = showAuthor ? 'u.username AS author_name' : 'NULL AS author_name';

    const [changelogs] = await pool.execute(
      `SELECT c.*, ${authorSelect},
              COALESCE(c.upvote_count, 0) AS upvotes,
              COALESCE(c.downvote_count, 0) AS downvotes,
              (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) AS comments
       FROM changelogs c
       LEFT JOIN users u ON c.author_id = u.id
       ${whereClause}
       ORDER BY c.published_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    for (const changelog of changelogs) {
      await loadTranslationIfAny(changelog, locale);
      const [images] = await pool.execute('SELECT * FROM images WHERE changelog_id = ?', [changelog.id]);
      changelog.images = images.map((img) => ({
        ...img,
        url: fileStorage.getFileUrl(img)
      }));
    }

    res.json({
      changelogs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get public changelogs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getChangelogDetail(req, res, projectId) {
  try {
    const { id } = req.params;
    const { locale } = req.query;
    const showAuthor = await settingsService.getSetting('show_changelog_author_username', false);
    const authorSelect = showAuthor ? 'u.username AS author_name' : 'NULL AS author_name';

    let changelogs;
    if (/^\d+$/.test(id)) {
      [changelogs] = await pool.execute(
        `SELECT c.*, ${authorSelect},
                COALESCE(c.upvote_count, 0) AS upvotes,
                COALESCE(c.downvote_count, 0) AS downvotes,
                (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) AS comments
         FROM changelogs c
         LEFT JOIN users u ON c.author_id = u.id
         WHERE c.id = ? AND c.status = ? AND c.project_id = ?`,
        [id, 'published', projectId]
      );
    } else {
      [changelogs] = await pool.execute(
        `SELECT c.*, ${authorSelect},
                COALESCE(c.upvote_count, 0) AS upvotes,
                COALESCE(c.downvote_count, 0) AS downvotes,
                (SELECT COUNT(*) FROM comments cm WHERE cm.changelog_id = c.id AND cm.is_approved = 1) AS comments
         FROM changelogs c
         LEFT JOIN users u ON c.author_id = u.id
         WHERE c.slug = ? AND c.status = ? AND c.project_id = ?`,
        [id, 'published', projectId]
      );
    }

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }

    const changelog = changelogs[0];
    await loadTranslationIfAny(changelog, locale);

    const cid = changelog.id;
    await pool.execute('UPDATE changelogs SET view_count = view_count + 1 WHERE id = ?', [cid]);

    const [images] = await pool.execute('SELECT * FROM images WHERE changelog_id = ?', [cid]);
    changelog.images = images.map((img) => ({
      ...img,
      url: fileStorage.getFileUrl(img)
    }));

    const [comments] = await pool.execute(
      'SELECT id, author_name, content, created_at FROM comments WHERE changelog_id = ? AND is_approved = 1 ORDER BY created_at DESC',
      [cid]
    );
    changelog.comments_list = comments;

    res.json({ changelog });
  } catch (error) {
    console.error('Get changelog error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function postVote(req, res, projectId) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { vote_type } = req.body;
    const ipAddress = req.ip;

    const [changelogs] = await pool.execute(
      'SELECT id FROM changelogs WHERE id = ? AND status = ? AND project_id = ?',
      [id, 'published', projectId]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }

    const [existingVotes] = await pool.execute(
      'SELECT id, vote_type FROM votes WHERE changelog_id = ? AND ip_address = ?',
      [id, ipAddress]
    );

    let action;
    if (existingVotes.length > 0) {
      const existingVote = existingVotes[0];
      if (existingVote.vote_type === vote_type) {
        await pool.execute('DELETE FROM votes WHERE changelog_id = ? AND ip_address = ?', [id, ipAddress]);
        action = 'removed';
      } else {
        await pool.execute('UPDATE votes SET vote_type = ? WHERE changelog_id = ? AND ip_address = ?', [
          vote_type,
          id,
          ipAddress
        ]);
        action = 'updated';
      }
    } else {
      await pool.execute('INSERT INTO votes (changelog_id, ip_address, vote_type) VALUES (?, ?, ?)', [
        id,
        ipAddress,
        vote_type
      ]);
      action = 'created';
    }

    await syncVoteCounts(id);
    const [[counts]] = await pool.execute(
      'SELECT COALESCE(upvote_count,0) AS upvotes, COALESCE(downvote_count,0) AS downvotes FROM changelogs WHERE id = ?',
      [id]
    );

    res.json({
      message: 'Vote recorded',
      action,
      upvotes: counts.upvotes,
      downvotes: counts.downvotes
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function commentApprovalInitial(isProfane) {
  const mode = (process.env.COMMENT_APPROVAL_MODE || 'auto').toLowerCase();
  if (mode === 'manual') {
    return false;
  }
  return !isProfane;
}

async function postComment(req, res, projectId) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { author_name, author_email, content } = req.body;
    const ipAddress = req.ip;

    const [changelogs] = await pool.execute(
      'SELECT id FROM changelogs WHERE id = ? AND status = ? AND project_id = ?',
      [id, 'published', projectId]
    );

    if (changelogs.length === 0) {
      return res.status(404).json({ error: 'Changelog not found' });
    }

    const maxCommentsPerIp = parseInt(process.env.MAX_COMMENTS_PER_IP, 10) || 10;
    const [commentCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM comments WHERE ip_address = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
      [ipAddress]
    );

    if (commentCount[0].count >= maxCommentsPerIp) {
      return res.status(429).json({ error: 'Too many comments from this IP address' });
    }

    const filteredContent = filter.clean(content);
    const filteredAuthorName = filter.clean(author_name);
    const isProfane = filteredContent !== content || filteredAuthorName !== author_name;
    const isApproved = commentApprovalInitial(isProfane);

    const [result] = await pool.execute(
      'INSERT INTO comments (changelog_id, author_name, author_email, content, ip_address, is_approved) VALUES (?, ?, ?, ?, ?, ?)',
      [id, filteredAuthorName, author_email || null, filteredContent, ipAddress, isApproved]
    );

    try {
      const config = await settingsService.getAppConfig();
      if (config.notifications.comments && emailService.isConfigured) {
        const [changelogRows] = await pool.execute('SELECT id, title FROM changelogs WHERE id = ?', [id]);
        if (changelogRows.length > 0) {
          await emailService.sendCommentNotification(
            {
              id: result.insertId,
              author_name: filteredAuthorName,
              author_email: author_email || null,
              content: filteredContent,
              created_at: new Date()
            },
            changelogRows[0]
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending comment notification:', emailError);
    }

    res.status(201).json({
      message: isApproved ? 'Comment added successfully' : 'Comment submitted for review',
      comment: {
        id: result.insertId,
        author_name: filteredAuthorName,
        content: filteredContent,
        is_approved: isApproved,
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getComments(req, res, projectId) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let changelogRow;
    if (/^\d+$/.test(id)) {
      [[changelogRow]] = await pool.execute(
        'SELECT id FROM changelogs WHERE id = ? AND status = ? AND project_id = ?',
        [id, 'published', projectId]
      );
    } else {
      [[changelogRow]] = await pool.execute(
        'SELECT id FROM changelogs WHERE slug = ? AND status = ? AND project_id = ?',
        [id, 'published', projectId]
      );
    }

    if (!changelogRow || !changelogRow.id) {
      return res.status(404).json({ error: 'Changelog not found' });
    }
    const changelogId = changelogRow.id;

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) AS total FROM comments WHERE changelog_id = ? AND is_approved = 1',
      [changelogId]
    );
    const total = countResult[0].total;

    const [comments] = await pool.execute(
      'SELECT id, author_name, content, created_at FROM comments WHERE changelog_id = ? AND is_approved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [changelogId, parseInt(limit, 10), offset]
    );

    res.json({
      comments,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  listChangelogs,
  getChangelogDetail,
  postVote,
  postComment,
  getComments,
  syncVoteCounts
};
