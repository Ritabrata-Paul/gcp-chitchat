import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { socketService } from '../services/socket';
import { UserList } from '../components/Chat/UserList';
import { ChatWindow } from '../components/Chat/ChatWindow';
import { LogOut } from 'lucide-react';

export const ChatPage = () => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      socketService.connect(user.uid);
    }

    return () => {
      socketService.disconnect();
    };
  }, [user]);

  const handleSelectUser = (userId: string, displayName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(displayName);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-violet-900 to-black">
      <header className="bg-gray-800/50 backdrop-blur-lg border-b border-violet-500/20 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-600">
            CHATHOLA
          </h1>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-white rounded-lg transition-all"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 bg-gray-800/30 backdrop-blur-sm border-r border-violet-500/20 hidden md:block">
          <UserList selectedUserId={selectedUserId} onSelectUser={handleSelectUser} />
        </div>

        <div className="flex-1">
          <ChatWindow selectedUserId={selectedUserId} selectedUserName={selectedUserName} />
        </div>
      </div>
    </div>
  );
};
