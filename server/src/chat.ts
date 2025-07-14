import { Server, Socket } from 'socket.io';
import prisma from './db';

export default (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('a user connected');

    socket.on('chatMessage', async (data: { userId: string; message: string }) => {
      const { userId, message } = data;

      if (message.trim().length === 0 || message.length > 280) {
        // Basic validation: non-empty and max length
        // More sophisticated validation could be added here
        return;
      }

      try {
        const newMessage = await prisma.chatMessage.create({
          data: {
            userId,
            message,
          },
          include: {
            user: true,
          },
        });

        const truncatedWallet = `${newMessage.user.walletAddress.substring(0, 6)}...${newMessage.user.walletAddress.substring(newMessage.user.walletAddress.length - 4)}`;

        io.emit('newChatMessage', {
          user: {
            walletAddress: truncatedWallet,
          },
          message: newMessage.message,
          createdAt: newMessage.createdAt,
        });
      } catch (error) {
        console.error('Error saving or broadcasting chat message:', error);
        // Optionally, emit an error event back to the sender
        socket.emit('chatError', { message: 'Failed to send message.' });
      }
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
  });
};