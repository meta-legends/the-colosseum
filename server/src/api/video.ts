import express from 'express';

const router = express.Router();

router.get('/current', (req, res) => {
  res.json({
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    startTime: Date.now(),
  });
});

export default router;