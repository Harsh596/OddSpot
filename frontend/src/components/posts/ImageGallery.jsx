// frontend/src/components/posts/ImageGallery.jsx
// Multi-image gallery grid with accessible keyboard lightbox (Escape, ArrowLeft, ArrowRight).

import React, { useState, useEffect, useCallback } from 'react';

export function ImageGallery({ images = [], title = 'Post Image' }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const normalizedImages = (images || []).map((img) =>
    typeof img === 'string' ? { url: img } : img
  );

  const isOpen = lightboxIndex !== null && normalizedImages.length > 0;

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const handlePrev = useCallback(() => {
    setLightboxIndex((curr) => {
      if (curr === null) return 0;
      return curr === 0 ? normalizedImages.length - 1 : curr - 1;
    });
  }, [normalizedImages.length]);

  const handleNext = useCallback(() => {
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
          onClick={() => setLightboxIndex(0)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightboxIndex(0)}
          title="Click to view full image"
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
              onClick={() => setLightboxIndex(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightboxIndex(idx)}
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
          >
            <button
              type="button"
              className="lightbox-close-btn"
              onClick={handleClose}
              aria-label="Close Lightbox"
            >
              ✕
            </button>

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

            <img
              src={normalizedImages[lightboxIndex].url}
              alt={`${title} - Enlarged`}
              className="lightbox-main-img"
            />

            <div className="lightbox-footer">
              <span className="lightbox-counter">
                {lightboxIndex + 1} / {normalizedImages.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
