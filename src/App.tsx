import { useEffect, useState } from 'react';
import { Create } from './pages/Create';
import { Game } from './pages/Game';
import { Home } from './pages/Home';

type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'game'; gameId: string };

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());

  useEffect(() => {
    const handlePopState = () => {
      setRoute(readRoute());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState(null, '', path);
    setRoute(readRoute());
  }

  if (route.name === 'create') {
    return <Create onBack={() => navigate('/')} onCreated={(gameId) => navigate(`/g/${gameId}`)} />;
  }

  if (route.name === 'game') {
    return <Game key={route.gameId} gameId={route.gameId} onHome={() => navigate('/')} />;
  }

  return <Home onCreate={() => navigate('/create')} onJoin={(gameId) => navigate(`/g/${gameId}`)} />;
}

function readRoute(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (parts.length === 1 && parts[0] === 'create') {
    return { name: 'create' };
  }

  if (parts.length === 2 && parts[0] === 'g') {
    return { name: 'game', gameId: parts[1] };
  }

  return { name: 'home' };
}
