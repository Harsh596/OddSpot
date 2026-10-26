// frontend/src/pages/NearbyFeed.jsx
// Backward-compatible wrapper forwarding to ExplorePage

import React from 'react';
import { ExplorePage } from './ExplorePage';

export function NearbyFeed(props) {
  return <ExplorePage {...props} />;
}

export default NearbyFeed;
