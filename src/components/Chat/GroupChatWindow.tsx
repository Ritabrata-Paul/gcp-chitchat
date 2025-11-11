import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, Paperclip, Users, X } from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  sender?: {
    display_name: string;
    avatar_url?: string;
  };
  files?: {
    file_name: string;
    file_type: string;
    firebase_url: string;
  }[];
}

interface GroupChatWindowProps {
  selectedGroupId: string | null;
  selectedGroupName: string;
}

export const GroupChatWindow = ({ selectedGroupId, selectedGroupName }: GroupChatWindowProps) => {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (selectedGroupId && user) {
      loadMessages();
      
      // Set up real-time subscription
      const channel = supabase
        .channel('group_messages_channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${selectedGroupId}`
          },
          (payload) => {
            handleNewMessage(payload.new as GroupMessage);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedGroupId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!selectedGroupId) return;

    const { data, error } = await supabase
      .from('group_messages')
      .select(`
        *,
        group_files (
          file_name,
          file_type,
          firebase_url
        )
      `)
      .eq('group_id', selectedGroupId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      // Load sender info for each message
      const messagesWithSenders = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: senderData } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', msg.sender_id)
            .single();
          
          return {
            ...msg,
            sender: senderData,
            files: msg.group_files || []
          };
        })
      );
      
      setMessages(messagesWithSenders);
    }
  };

  const handleNewMessage = async (message: GroupMessage) => {
    // Load sender info
    const { data: senderData } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', message.sender_id)
      .single();
    
    message.sender = senderData || undefined;

    // Load file data if it's a file message
    if (message.message_type === 'file') {
      const { data: fileData } = await supabase
        .from('group_files')
        .select('file_name, file_type, firebase_url')
        .eq('message_id', message.id);
      
      message.files = fileData || [];
    }

    setMessages((prev) => {
      // Check if message already exists
      if (prev.some(m => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
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
      const fileRef = storageRef(storage, `group_messages/${Date.now()}_${file.name}`);
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
    if ((!newMessage.trim() && !selectedFile) || !user || !selectedGroupId) return;

    setUploading(true);
    try {
      let fileUrl = '';
      let messageType = 'text';

      if (selectedFile) {
        fileUrl = await uploadFile(selectedFile);
        messageType = 'file';
      }

      const messageData = {
        group_id: selectedGroupId,
        sender_id: user.uid,
        content: selectedFile ? selectedFile.name : newMessage,
        message_type: messageType
      };

      const { data: messageResult, error: messageError } = await supabase
        .from('group_messages')
        .insert(messageData)
        .select()
        .single();

      if (messageError) throw messageError;

      if (selectedFile && fileUrl) {
        await supabase.from('group_files').insert({
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

  if (!selectedGroupId) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-violet-900/50">
        <div className="text-center">
          <Users size={64} className="mx-auto mb-4 text-violet-500/50" />
          <p className="text-gray-400 text-lg">Select a group to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-900/30 to-violet-900/30">
      <div className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-violet-500/20">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Users size={24} />
          {selectedGroupName}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isOwn = message.sender_id === user?.uid;
          return (
            <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-md">
                {!isOwn && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                      {message.sender?.avatar_url ? (
                        <img
                          src={message.sender.avatar_url}
                          alt={message.sender.display_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        message.sender?.display_name?.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{message.sender?.display_name}</span>
                  </div>
                )}
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
                  <p className={`text-xs mt-1 ${isOwn ? 'text-violet-200' : 'text-gray-400'}`}>
                    {new Date(message.created_at).toLocaleTimeString()}
                  </p>
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