import React from 'react';

export function Icon({ path }: { path: string }): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d={path} />
    </svg>
  );
}
