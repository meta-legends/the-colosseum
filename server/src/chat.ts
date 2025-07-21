import { Server, Socket } from 'socket.io';
import { supabase } from './supabase'; // Import the Supabase client

export default (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('a user connected to the chat socket');

    socket.on('chatMessage', async (data: { userId: string; message: string }) => {
      const { userId, message } = data;

      if (message.trim().length === 0 || message.length > 280) {
        // Basic validation: non-empty and max length
        return;
      }

      try {
        // Insert the new message into the Supabase 'ChatMessage' table
        const { error } = await supabase
          .from('ChatMessage')
          .insert([{ userId, message }]);

        if (error) {
          throw error;
        }

        // We no longer need to manually broadcast the message with io.emit.
        // Supabase Realtime will handle notifying the clients.

      } catch (error) {
        console.error('Error saving chat message to Supabase:', error);
        socket.emit('chatError', { message: 'Failed to send message.' });
      }
    });

    socket.on('disconnect', () => {
      console.log('user disconnected from the chat socket');
    });
  });
};