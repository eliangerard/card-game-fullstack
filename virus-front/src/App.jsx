import { useState } from 'react';
import { useStore } from './store/useStore';
import { HomeScreen } from './features/home/HomeScreen';
import { LobbyScreen } from './features/lobby/LobbyScreen';
import { RoomScreen } from './features/lobby/RoomScreen';
import { GameScreen } from './features/game/GameScreen';

// Enrutado por estado: inicio → lobby → sala → partida
const App = () => {
  const [entered, setEntered] = useState(false);
  const session = useStore((s) => s.session);
  const room = useStore((s) => s.room);
  const game = useStore((s) => s.game);

  if (room && room.status !== 'lobby' && game) return <GameScreen />;
  if (room) return <RoomScreen />;
  if (!entered || !session) return <HomeScreen onEnter={() => setEntered(true)} ready={!!session} />;
  return <LobbyScreen />;
};

export default App;
