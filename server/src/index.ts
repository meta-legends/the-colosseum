import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import authRouter from './api/auth';
import videoRouter from './api/video';
import initializeChat from './chat';
import bettingRouter from './api/betting';
import usersRouter from './api/users'; // Import the new router
import mvpBettingRouter from './api/mvpBetting'; // Import the MVP router

const app = express();
const port = 3001;

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST"]
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/video', videoRouter);
app.use('/api', bettingRouter);
app.use('/api', usersRouter); // Use the new router
app.use('/api/mvp', mvpBettingRouter); // Use the MVP router

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to The Colosseum' });
});

initializeChat(io);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});