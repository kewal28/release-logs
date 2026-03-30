const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { publicRateLimit, voteRateLimit, commentRateLimit } = require('../middleware/rateLimit');
const {
  listChangelogs,
  getChangelogDetail,
  postVote,
  postComment,
  getComments
} = require('./changelogPublicShared');

const router = express.Router({ mergeParams: true });

router.use(publicRateLimit);

router.use(async (req, res, next) => {
  try {
    const { projectKey } = req.params;
    const [rows] = await pool.execute('SELECT id, user_id, name, public_key FROM projects WHERE public_key = ?', [
      projectKey
    ]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }
    req.project = rows[0];
    next();
  } catch (e) {
    next(e);
  }
});

router.get('/changelogs', (req, res) => listChangelogs(req, res, req.project.id));

router.get('/changelogs/:id', (req, res) => getChangelogDetail(req, res, req.project.id));

router.post(
  '/changelogs/:id/vote',
  express.json(),
  voteRateLimit,
  [body('vote_type').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote')],
  (req, res) => postVote(req, res, req.project.id)
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
  (req, res) => postComment(req, res, req.project.id)
);

router.get('/changelogs/:id/comments', (req, res) => getComments(req, res, req.project.id));

module.exports = router;
