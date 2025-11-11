import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, Paperclip, MessageSquare, X, Check, CheckCheck } from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  read: boolean;
  created_at: string;
  files?: {
    file_name: string;
    file_type: string;
    firebase_url: string;
  }[];
}

interface ChatWindowProps {
  selectedUserId: string | null;
  selectedUserName: string;
}

export const ChatWindow = ({ selectedUserId, selectedUserName }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (selectedUserId && user) {
      loadMessages();
      markMessagesAsRead();
      
      const channel = supabase
        .channel(`messages_${selectedUserId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          async (payload) => {
            const newMsg = payload.new as Message;
            
            if (
              (newMsg.sender_id === selectedUserId && newMsg.receiver_id === user.uid) ||
              (newMsg.sender_id === user.uid && newMsg.receiver_id === selectedUserId)
            ) {
              if (newMsg.message_type === 'file') {
                const { data: fileData } = await supabase
                  .from('files')
                  .select('file_name, file_type, firebase_url')
                  .eq('message_id', newMsg.id);
                
                newMsg.files = fileData || [];
              }
              
              setMessages((prev) => {
                if (prev.some(m => m.id === newMsg.id)) {
                  return prev;
                }
                return [...prev, newMsg];
              });

              // Mark as read if message is from the selected user
              if (newMsg.sender_id === selectedUserId && newMsg.receiver_id === user.uid) {
                markMessagesAsRead();
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            const updatedMsg = payload.new as Message;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === updatedMsg.id ? updatedMsg : msg))
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedUserId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!selectedUserId || !user) return;

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        files (
          file_name,
          file_type,
          firebase_url
        )
      `)
      .or(`and(sender_id.eq.${user.uid},receiver_id.eq.${selectedUserId}),and(sender_id.eq.${selectedUserId},receiver_id.eq.${user.uid})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      setMessages(data || []);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedUserId || !user) return;

    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', selectedUserId)
      .eq('receiver_id', user.uid)
      .eq('read', false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) {
        alert('File size must be less than 500MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fileRef = storageRef(storage, `messages/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !user || !selectedUserId) return;

    setUploading(true);
    try {
      let fileUrl = '';
      let messageType = 'text';

      if (selectedFile) {
        fileUrl = await uploadFile(selectedFile);
        messageType = 'file';
      }

      const messageData = {
        sender_id: user.uid,
        receiver_id: selectedUserId,
        content: selectedFile ? selectedFile.name : newMessage,
        message_type: messageType,
        read: false
      };

      const { data: messageResult, error: messageError } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (messageError) throw messageError;

      if (selectedFile && fileUrl) {
        await supabase.from('files').insert({
          message_id: messageResult.id,
          file_name: selectedFile.name,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
          firebase_url: fileUrl
        });
      }

      setNewMessage('');
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setUploading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!selectedUserId) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-violet-900/50">
        <div className="text-center">
          <MessageSquare size={64} className="mx-auto mb-4 text-violet-500/50" />
          <p className="text-gray-400 text-lg">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-900/30 to-violet-900/30">
      <div className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-violet-500/20">
        <h2 className="text-xl font-semibold text-white">{selectedUserName}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isOwn = message.sender_id === user?.uid;
          return (
            <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-md">
                <div
                  className={`px-4 py-2 rounded-2xl ${
                    isOwn
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white'
                      : 'bg-gray-800 text-white'
                  }`}
                >
                  {message.message_type === 'file' && message.files?.[0] ? (
                    <div>
                      <a
                        href={message.files[0].firebase_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Paperclip size={16} />
                        <span className="text-sm">{message.files[0].file_name}</span>
                      </a>
                      {message.files[0].file_type.startsWith('image/') && (
                        <img
                          src={message.files[0].firebase_url}
                          alt={message.files[0].file_name}
                          className="mt-2 rounded-lg max-w-full"
                        />
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                  <div className={`flex items-center justify-end gap-1 mt-1 text-xs ${isOwn ? 'text-violet-200' : 'text-gray-400'}`}>
                    <span>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isOwn && (
                      message.read ? (
                        <CheckCheck size={14} className="text-blue-400" />
                      ) : (
                        <Check size={14} />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {selectedFile && (
        <div className="px-4 py-2 bg-gray-800/50 border-t border-violet-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip size={16} className="text-violet-400" />
            <span className="text-sm text-white">{selectedFile.name}</span>
          </div>
          <button
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {uploading && uploadProgress > 0 && (
        <div className="px-4 py-2 bg-gray-800/50 border-t border-violet-500/20">
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-violet-600 to-purple-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Uploading... {Math.round(uploadProgress)}%</p>
        </div>
      )}

      <div className="p-4 bg-gray-800/50 backdrop-blur-sm border-t border-violet-500/20">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.zip"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-3 bg-gray-700 text-violet-400 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            <Paperclip size={20} />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={uploading}
            className="flex-1 px-4 py-3 bg-gray-900/50 border border-violet-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={uploading || (!newMessage.trim() && !selectedFile)}
            className="p-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};