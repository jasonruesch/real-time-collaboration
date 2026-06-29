import { Button, Heading, Text } from '@jasonruesch/react';
import { useNavigate } from 'react-router';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Heading>Nothing here</Heading>
      <Text className="text-muted">That board or page doesn’t exist.</Text>
      <Button onClick={() => navigate('/')}>Back to start</Button>
    </div>
  );
}
