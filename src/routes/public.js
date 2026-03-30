const express = require('express');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { publicRateLimit, voteRateLimit, commentRateLimit } = require('../middleware/rateLimit');
const settingsService = require('../services/settings');
const {
  listChangelogs,
  getChangelogDetail,
  postVote,
  postComment,
  getComments
} = require('./changelogPublicShared');

const router = express.Router();

/**
 * @swagger
 * /api/public/settings:
 *   get:
 *     summary: Get public application settings
 *     tags: [Public]
 */
router.get('/public/settings', async (req, res) => {
  try {
    const config = await settingsService.getAppConfig();
    const publicSettings = {
      company: config.company,
      appearance: config.appearance
    };
    res.json({ config: publicSettings });
  } catch (error) {
    console.error('Error getting public settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.use(publicRateLimit);

async function resolveLegacyProject(req, res) {
  const pk = req.query.projectKey;
  if (pk) {
    const [rows] = await pool.execute('SELECT id FROM projects WHERE public_key = ?', [pk]);
    if (!rows.length) {
      res.status(404).json({ error: 'Project not found' });
      return null;
    }
    return rows[0].id;
  }
  const [rows] = await pool.execute('SELECT id FROM projects ORDER BY id ASC LIMIT 2');
  if (rows.length === 1) {
    return rows[0].id;
  }
  res.status(400).json({
    error: 'projectKey query parameter is required when multiple projects exist',
    hint: 'Use /api/p/{projectKey}/changelogs or pass ?projectKey='
  });
  return null;
}

/** @deprecated Prefer /api/p/{projectKey}/changelogs */
router.get('/changelogs', async (req, res) => {
  const projectId = await resolveLegacyProject(req, res);
  if (projectId == null) return;
  return listChangelogs(req, res, projectId);
});

/** @deprecated Prefer /api/p/{projectKey}/changelogs/:id */
router.get('/changelogs/:id', async (req, res) => {
  const projectId = await resolveLegacyProject(req, res);
  if (projectId == null) return;
  return getChangelogDetail(req, res, projectId);
});

router.post(
  '/changelogs/:id/vote',
  express.json(),
  voteRateLimit,
  [body('vote_type').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote')],
  async (req, res) => {
    const projectId = await resolveLegacyProject(req, res);
    if (projectId == null) return;
    return postVote(req, res, projectId);
  }
);

router.post(
  '/changelogs/:id/comments',
  commentRateLimit,
  [
    body('author_name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Author name is required and must be less than 100 characters'),
    body('author_email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('content')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Content is required and must be less than 1000 characters'),
    body(process.env.HONEYPOT_FIELD_NAME || '_gotcha')
      .optional()
      .isEmpty()
      .withMessage('Honeypot field should be empty')
  ],
  async (req, res) => {
    const projectId = await resolveLegacyProject(req, res);
    if (projectId == null) return;
    return postComment(req, res, projectId);
  }
);

router.get('/changelogs/:id/comments', async (req, res) => {
  const projectId = await resolveLegacyProject(req, res);
  if (projectId == null) return;
  return getComments(req, res, projectId);
});

module.exports = router;
