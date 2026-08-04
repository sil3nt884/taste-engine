'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}
