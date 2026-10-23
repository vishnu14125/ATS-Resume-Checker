import React from 'react';

/** The loading state used across the app: one spinner and a short label. */
const Loading = ({ label = 'Loading…' }) => (
  <div role="status" className="flex items-center justify-center gap-3 py-20 text-sm font-medium text-muted">
    <span className="spinner text-primary" />
    <span>{label}</span>
  </div>
);

export default Loading;
