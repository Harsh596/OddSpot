// frontend/src/components/visits/ThenAndNowGallery.jsx
// Signature Then-and-Now real-world visitor comparison gallery:
// Displays original post photo ("Then") side-by-side with verified scout visitor check-in photos ("Now").

import { useState } from 'react';

export function ThenAndNowGallery({
  post = {},
  visits = [],
  onOpenCheckIn = () => {},
  className = '',
}) {
  const [selectedImage, setSelectedImage] = useState(null);

  // Original photo from spot
  const originalPhoto = post.images && post.images.length > 0 ? post.images[0] : null;

  // Filter verified visits that have a photoUrl
  const photoVisits = visits.filter((v) => Boolean(v.photoUrl && v.photoUrl.trim()));

  // Active visitor photo index for "Now" side
  const [activeVisitIndex, setActiveVisitIndex] = useState(0);
  const currentVisit = photoVisits.length > 0 ? photoVisits[activeVisitIndex] : null;

  return (
    <div className={`then-and-now-gallery ${className}`}>
      <div className="gallery-header-row">
        <div className="gallery-title-group">
          <span className="gallery-icon">⏳</span>
          <h3 className="gallery-title">Then & Now: Field Condition</h3>
          <span className="gallery-count-badge">
            {photoVisits.length} {photoVisits.length === 1 ? 'Proof Photo' : 'Proof Photos'}
          </span>
        </div>

        <button
          type="button"
          className="btn-add-proof"
          onClick={onOpenCheckIn}
          title="Log a visit with a new photo"
        >
          📷 Add Photo Proof
        </button>
      </div>

      <div className="then-now-container">
        {/* "THEN" - Original Spot Discovery */}
        <div className="then-side-card">
          <div className="then-side-badge">THEN · Original Discovery</div>
          {originalPhoto ? (
            <div
              className="then-image-wrapper"
              onClick={() => setSelectedImage(originalPhoto.url)}
              role="button"
              tabIndex={0}
              aria-label="Enlarge original photo"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedImage(originalPhoto.url)}
            >
              <img
                src={originalPhoto.url}
                alt={`${post.title} when discovered`}
                className="then-image"
                loading="lazy"
              />
              <div className="image-zoom-overlay">🔍 Enlarge</div>
            </div>
          ) : (
            <div className="no-image-placeholder">No original photo available</div>
          )}

          <div className="then-meta">
            <span className="meta-author">
              Logged by <strong>{post.authorId?.username || 'Scout'}</strong>
            </span>
            <span className="meta-date">
              {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : 'Original date'}
            </span>
          </div>
        </div>

        {/* VS Indicator */}
        <div className="then-now-divider" aria-hidden="true">
          <span className="vs-badge">VS</span>
        </div>

        {/* "NOW" - Verified Visitor Check-In Photos */}
        <div className="now-side-card">
          <div className="now-side-badge">
            NOW · Verified Check-Ins ({photoVisits.length})
          </div>

          {currentVisit ? (
            <div className="now-content">
              <div
                className="now-image-wrapper"
                onClick={() => setSelectedImage(currentVisit.photoUrl)}
                role="button"
                tabIndex={0}
                aria-label="Enlarge visitor proof photo"
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedImage(currentVisit.photoUrl)}
              >
                <img
                  src={currentVisit.photoUrl}
                  alt={`Current condition by ${currentVisit.userId?.username || 'Scout'}`}
                  className="now-image"
                  loading="lazy"
                />
                <div className="image-zoom-overlay">🔍 Enlarge</div>

                {/* Spot condition tag */}
                <span className={`condition-pill condition-${currentVisit.spotStatus || 'still_there'}`}>
                  {currentVisit.spotStatus === 'still_there'
                    ? '🟢 Still there'
                    : currentVisit.spotStatus === 'changed'
                    ? '🟡 Changed / Decayed'
                    : '🔴 Gone / Demolished'}
                </span>
              </div>

              {/* Visitor Attribution & Field Note */}
              <div className="now-meta">
                <div className="now-visitor-info">
                  <span className="visitor-name">
                    Scout: <strong>{currentVisit.userId?.username || 'Scout'}</strong>
                  </span>
                  <span className="visitor-date">
                    {new Date(currentVisit.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {currentVisit.note && (
                  <p className="now-field-note">
                    "{currentVisit.note}"
                  </p>
                )}
              </div>

              {/* Photo Carousel Controls if multiple visits exist */}
              {photoVisits.length > 1 && (
                <div className="photo-carousel-controls">
                  <button
                    type="button"
                    className="btn-caro-nav"
                    onClick={() =>
                      setActiveVisitIndex((prev) => (prev > 0 ? prev - 1 : photoVisits.length - 1))
                    }
                    aria-label="Previous visitor photo"
                  >
                    ‹
                  </button>
                  <span className="caro-counter">
                    {activeVisitIndex + 1} of {photoVisits.length}
                  </span>
                  <button
                    type="button"
                    className="btn-caro-nav"
                    onClick={() =>
                      setActiveVisitIndex((prev) => (prev < photoVisits.length - 1 ? prev + 1 : 0))
                    }
                    aria-label="Next visitor photo"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="now-empty-state">
              <span className="empty-camera-icon">📸</span>
              <h4>No Visitor Photos Yet</h4>
              <p>Be the first scout to visit this location in person and document its current state!</p>
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={onOpenCheckIn}
              >
                Log First Visit Proof
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="lightbox-backdrop" onClick={() => setSelectedImage(null)}>
          <div className="lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lightbox-close-btn"
              onClick={() => setSelectedImage(null)}
              aria-label="Close enlarged image"
            >
              ✕
            </button>
            <img src={selectedImage} alt="Enlarged spot photo" className="lightbox-full-img" />
          </div>
        </div>
      )}
    </div>
  );
}

export default ThenAndNowGallery;
