import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { ref, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { auth, database } from '../config/firebase';
import { supabase } from '../config/supabase';

interface AuthContextType { 
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUserStatus = async (userId: string, online: boolean) => {
    // Update Firebase Realtime Database
    const userStatusRef = ref(database, `users/${userId}/status`);
    await set(userStatusRef, {
      online,
      lastSeen: serverTimestamp()
    });

    if (online) {
      onDisconnect(userStatusRef).set({
        online: false,
        lastSeen: serverTimestamp()
      });
    }

    // Update Supabase
    await supabase
      .from('profiles')
      .update({
        online_status: online,
        last_seen: new Date().toISOString()
      })
      .eq('id', userId);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Check if profile exists in Supabase
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.uid)
          .single();

        // If missing, insert automatically
        if (!existingProfile) {
          await supabase.from('profiles').insert({
            id: user.uid,
            email: user.email,
            display_name: user.displayName || user.email?.split('@')[0] || 'User',
            online_status: true,
            created_at: new Date().toISOString(),
          });
        }

        // Update presence
        await updateUserStatus(user.uid, true);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Insert profile in Supabase
    await supabase.from('profiles').insert({
      id: userCredential.user.uid,
      email: email,
      display_name: displayName,
      online_status: true,
      created_at: new Date().toISOString()
    });

    // Set Firebase Realtime Database user data
    const userRef = ref(database, `users/${userCredential.user.uid}`);
    await set(userRef, {
      email,
      displayName,
      status: {
        online: true,
        lastSeen: serverTimestamp()
      }
    });
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    if (user) {
      await updateUserStatus(user.uid, false);
    }
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 