import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import authRouter from './api/auth';
import videoRouter from './api/video';
import initializeChat from './chat';
import initializeBetting from './betting';
import bettingRouter from './api/betting';

const app = express();
const port = 3001;

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST"]
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/video', videoRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use('/api/betting', bettingRouter(io));

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to The Colosseum' });
});

initializeChat(io);
initializeBetting(io);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});