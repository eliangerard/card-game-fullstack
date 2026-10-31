import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { Backdrop } from '../home/Backdrop';
import { TopBar } from './TopBar';
import { ProfileCard } from './ProfileCard';
import { RoomList } from './RoomList';
import { CreateRoomForm, ROOM_NAME_MAX } from './CreateRoomForm';
import { NameModal } from './NameModal';
import { Toaster } from './Toaster';
import { toastError } from './toasts';
import { useLobbyMusic } from './music';
import { DEMO } from './demo';
import { ConnectionBanner } from './ConnectionBanner';
import '../home/home.css';
import './lobby.css';

// Lobby: perfil a la izquierda, salas y "crear sala" a la derecha
export const LobbyScreen = () => {
  const profile = useStore((s) => s.profile);
  const createRoom = useStore((s) => s.createRoom);
  const joinRoom = useStore((s) => s.joinRoom);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [askName, setAskName] = useState(false);
  const pending = useRef(null);

  useLobbyMusic();

  // Si no hay nombre, primero lo pide y luego sigue con la acción
  const requireName = (action) => {
    if (useStore.getState().profile.name?.trim()) return action();
    pending.current = action;
    setAskName(true);
  };

  const handleCreate = (name, maxPlayers) => requireName(async () => {
    const finalName = (name || `Sala de ${useStore.getState().profile.name}`).slice(0, ROOM_NAME_MAX);
    setCreating(true);
    try {
      await createRoom(finalName, maxPlayers);
    } catch (err) {
      toastError(err);
    } finally {
      setCreating(false);
    }
  });

  const handleJoin = (roomId) => requireName(async () => {
    setJoiningId(roomId);
    try {
      await joinRoom(roomId);
    } catch (err) {
      toastError(err);
    } finally {
      setJoiningId(null);
    }
  });

  return (
    <div className="screen lobby">
      <Backdrop intensity={0.4} />
      <TopBar subtitle="Bienvenid@ a" title={profile.name ? `¡Hola, ${profile.name}!` : 'El lobby'} />

      <main className="lobby__grid">
        <ProfileCard />

        <motion.div
          className="ui-panel rooms-panel"
          initial={{ opacity: 0, x: 60, rotate: 2 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.12 }}
        >
          <div className="panel-tab panel-tab--accent">Jugar en línea</div>
          <CreateRoomForm
            onCreate={handleCreate}
            busy={creating}
            defaultName={profile.name ? `Sala de ${profile.name}` : 'Nombre de la sala'}
          />
          <RoomList onJoin={handleJoin} joiningId={joiningId} />
        </motion.div>
      </main>

      <NameModal
        open={askName}
        onClose={() => { setAskName(false); pending.current = null; }}
        onDone={() => {
          setAskName(false);
          const action = pending.current;
          pending.current = null;
          action?.();
        }}
      />
      <Toaster />
      {DEMO === 'offline' && <ConnectionBanner />}
    </div>
  );
};
