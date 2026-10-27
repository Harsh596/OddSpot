// frontend/src/components/notifications/NotificationsDrawer.jsx
// Slide-out notifications drawer with unread count badge, type icons,
// click-to-read, mark all read, and navigation to target posts.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api';

export function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = Date.now();
  const past = new Date(dateString).getTime();
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function getNotificationIcon(type) {
  switch (type) {
    case 'comment':
      return '💬';
    case 'reply':
      return '↩️';
    case 'visit':
      return '📍';
    case 'mention':
      return '📣';
    case 'tier_up':
      return '🏆';
    default:
      return '🔔';
  }
}

export function formatNotificationMessage(n) {
  const actor = n.actorId?.username || 'A scout';
  const postTitle = n.postId?.title ? `"${n.postId.title}"` : 'your spot';

  switch (n.type) {
    case 'comment':
      return (
        <>
          <strong>{actor}</strong> commented on {postTitle}
        </>
      );
    case 'reply':
      return (
        <>
          <strong>{actor}</strong> replied to your comment on {postTitle}
        </>
      );
    case 'visit':
      return (
        <>
          <strong>{actor}</strong> recorded a verified visit to {postTitle}
        </>
      );
    case 'mention':
      return (
        <>
          <strong>{actor}</strong> mentioned you in {postTitle}
        </>
      );
    case 'tier_up':
      return (
        <>
          Your spot {postTitle} leveled up to the next Oddometer tier!
        </>
      );
    default:
      return (
        <>
          <strong>{actor}</strong> interacted with {postTitle}
        </>
      );
  }
}

export function NotificationsDrawer({
  isOpen,
  onClose,
  navigate,
  onUnreadCountUpdate,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const drawerRef = useRef(null);

  const fetchNotifications = useCallback(
    async (reset = true, cursor = null) => {
      setLoading(true);
      try {
        const res = await api.getNotifications({
          cursor: cursor || undefined,
          limit: 20,
          unreadOnly: unreadOnly || undefined,
        });

        if (reset) {
          setNotifications(res.notifications || []);
        } else {
          setNotifications((prev) => [...prev, ...(res.notifications || [])]);
        }

        setNextCursor(res.nextCursor || null);
        setHasMore(!!res.hasMore);

        if (onUnreadCountUpdate && res.unreadCount !== undefined) {
          onUnreadCountUpdate(res.unreadCount);
        }
      } catch (err) {
        console.warn('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    },
    [unreadOnly, onUnreadCountUpdate]
  );

  // Fetch when drawer opens or tab changes
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(true);
    }
  }, [isOpen, unreadOnly, fetchNotifications]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const res = await api.markNotificationsRead({ all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      if (onUnreadCountUpdate) {
        onUnreadCountUpdate(0);
      }
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (notif) => {
    // Mark as read in background if unread
    if (!notif.read) {
      try {
        await api.markNotificationsRead({ ids: [notif._id] });
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, read: true } : n))
        );
        if (onUnreadCountUpdate) {
          onUnreadCountUpdate((prev) => Math.max(0, prev - 1));
        }
      } catch {
        // Non-blocking
      }
    }

    onClose();

    // Navigate to post detail
    const targetPostId = notif.postId?._id || notif.postId;
    if (targetPostId) {
      navigate(`#/post/${targetPostId}`);
    }
  };

  const handleLoadMore = () => {
    if (nextCursor && !loading) {
      fetchNotifications(false, nextCursor);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="notifications-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications Drawer"
        ref={drawerRef}
      >
        <div className="drawer-header">
          <div className="drawer-title-row">
            <h3>🔔 Field Transmissions</h3>
            <button
              type="button"
              className="btn-drawer-close"
              onClick={onClose}
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>

          <div className="drawer-actions-row">
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${!unreadOnly ? 'active' : ''}`}
                onClick={() => setUnreadOnly(false)}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-pill ${unreadOnly ? 'active' : ''}`}
                onClick={() => setUnreadOnly(true)}
              >
                Unread Only
              </button>
            </div>

            <button
              type="button"
              className="btn-mark-all"
              onClick={handleMarkAllRead}
              disabled={markingAll || notifications.every((n) => n.read)}
              title="Mark all notifications as read"
            >
              {markingAll ? 'Updating...' : '✓ Mark all read'}
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {loading && notifications.length === 0 ? (
            <div className="drawer-loading">Scanning signals...</div>
          ) : notifications.length === 0 ? (
            <div className="drawer-empty">
              <span className="empty-icon">📡</span>
              <h4>No notifications</h4>
              <p>
                {unreadOnly
                  ? 'All transmissions read. Switch to "All" to view history.'
                  : 'When scouts comment, reply, or verify visits to your spots, signals appear here.'}
              </p>
            </div>
          ) : (
            <div className="notifications-list">
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className={`notification-item ${!n.read ? 'unread' : 'read'}`}
                  onClick={() => handleItemClick(n)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleItemClick(n);
                    }
                  }}
                >
                  <div className="item-icon-wrapper" aria-hidden="true">
                    <span className="item-type-icon">{getNotificationIcon(n.type)}</span>
                  </div>

                  <div className="item-content">
                    <p className="item-message">{formatNotificationMessage(n)}</p>
                    <span className="item-time">{formatRelativeTime(n.createdAt)}</span>
                  </div>

                  {!n.read && <span className="unread-dot" title="Unread" />}
                </div>
              ))}

              {hasMore && (
                <button
                  type="button"
                  className="btn-load-more-notifs"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? 'Retrieving...' : 'Load Older Transmissions'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationsDrawer;
