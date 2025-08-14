import { Server } from 'socket.io';
import { prisma } from './db';

const bettingLocks = new Map<string, boolean>();

const setupBettingLockTimer = (io: Server) => {
  // Logic for handling betting locks can be implemented here
  // For example, periodically check for battles that should be locked
};

export const handleBetting = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('a user connected to betting');

    socket.on('disconnect', () => {
      console.log('user disconnected from betting');
    });
  });

  setupBettingLockTimer(io);
};