import { useState, useEffect, useCallback } from 'react';

/**
 * ImageGallery - Multi-image gallery grid with accessible keyboard lightbox (Escape, ArrowLeft, ArrowRight)
 * and 1x / 2x zoom toggle for detail inspection.
 */
export function ImageGallery({ images = [], title = 'Post Image' }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const normalizedImages = (images || []).map((img) =>
    typeof img === 'string' ? { url: img } : img
  );

  const isOpen = lightboxIndex !== null && normalizedImages.length > 0;

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
    setIsZoomed(false);
  }, []);

  const handlePrev = useCallback(() => {
    setIsZoomed(false);
    setLightboxIndex((curr) => {
      if (curr === null) return 0;
      return curr === 0 ? normalizedImages.length - 1 : curr - 1;
    });
  }, [normalizedImages.length]);

  const handleNext = useCallback(() => {
    setIsZoomed(false);
    setLightboxIndex((curr) => {
      if (curr === null) return 0;
      return curr === normalizedImages.length - 1 ? 0 : curr + 1;
    });
  }, [normalizedImages.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handlePrev, handleNext]);

  if (!normalizedImages.length) return null;

  return (
    <div className="odd-image-gallery">
      {normalizedImages.length === 1 ? (
        <div
          className="single-image-container"
          onClick={() => {
            setIsZoomed(false);
            setLightboxIndex(0);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsZoomed(false);
              setLightboxIndex(0);
            }
          }}
          title="Click to view full image in lightbox"
        >
          <img
            src={normalizedImages[0].url}
            alt={title}
            className="gallery-single-image"
            loading="lazy"
          />
        </div>
      ) : (
        <div className={`gallery-grid gallery-grid-${Math.min(normalizedImages.length, 4)}`}>
          {normalizedImages.map((img, idx) => (
            <div
              key={idx}
              className="gallery-grid-item"
              onClick={() => {
                setIsZoomed(false);
                setLightboxIndex(idx);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsZoomed(false);
                  setLightboxIndex(idx);
                }
              }}
              title={`View image ${idx + 1} of ${normalizedImages.length}`}
            >
              <img
                src={img.url}
                alt={`${title} (${idx + 1}/${normalizedImages.length})`}
                loading="lazy"
              />
              {idx === 3 && normalizedImages.length > 4 && (
                <div className="gallery-more-overlay">
                  +{normalizedImages.length - 4} more
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Keyboard Lightbox Modal */}
      {isOpen && (
        <div
          className="odd-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image Lightbox"
          onClick={handleClose}
        >
          <div
            className="odd-lightbox-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              overflow: isZoomed ? 'auto' : 'hidden',
              maxHeight: '90vh',
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Top Toolbar */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                display: 'flex',
                gap: '8px',
                zIndex: 10,
              }}
            >
              {/* 1x / 2x Zoom Toggle Button (04-visual-capture.md Rank #20) */}
              <button
                type="button"
                className="lightbox-zoom-btn"
                onClick={() => setIsZoomed((prev) => !prev)}
                title={isZoomed ? 'Reset zoom to 1x' : 'Zoom in 2x for fine inspection'}
                style={{
                  cursor: 'pointer',
                  background: 'rgba(24, 24, 27, 0.85)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 700,
                  backdropFilter: 'blur(4px)',
                }}
              >
                {isZoomed ? '🔍 2x (Reset)' : '🔍 1x (Zoom)'}
              </button>

              <button
                type="button"
                className="lightbox-close-btn"
                onClick={handleClose}
                aria-label="Close Lightbox"
                style={{
                  cursor: 'pointer',
                  background: 'rgba(24, 24, 27, 0.85)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backdropFilter: 'blur(4px)',
                }}
              >
                ✕ Close
              </button>
            </div>

            {normalizedImages.length > 1 && (
              <>
                <button
                  type="button"
                  className="lightbox-nav-btn prev-btn"
                  onClick={handlePrev}
                  aria-label="Previous Image"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="lightbox-nav-btn next-btn"
                  onClick={handleNext}
                  aria-label="Next Image"
                >
                  ›
                </button>
              </>
            )}

            <div
              style={{
                overflow: isZoomed ? 'auto' : 'hidden',
                maxHeight: '80vh',
                maxWidth: '85vw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={normalizedImages[lightboxIndex].url}
                alt={`${title} - Enlarged`}
                className="lightbox-main-img"
                onClick={() => setIsZoomed((prev) => !prev)}
                style={{
                  transform: isZoomed ? 'scale(2)' : 'scale(1)',
                  transformOrigin: 'center center',
                  cursor: isZoomed ? 'zoom-out' : 'zoom-in',
                  transition: 'transform 200ms ease',
                  maxHeight: isZoomed ? 'none' : '75vh',
                  maxWidth: isZoomed ? 'none' : '85vw',
                  objectFit: 'contain',
                }}
              />
            </div>

            <div className="lightbox-footer" style={{ marginTop: '8px' }}>
              <span className="lightbox-counter" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                {lightboxIndex + 1} / {normalizedImages.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
