import React, { useState, useEffect, useRef } from 'react';

interface StudyPopoverProps {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}

export function StudyPopover({ id, label, title, children }: StudyPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleMouseLeave = () => {
    closeTimer.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  return (
    <div
      ref={containerRef}
      className="study-popover-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        id={`trigger-${id}`}
        className="study-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={`dialog-${id}`}
        onClick={() => setIsOpen(prev => !prev)}
      >
        <span className="study-trigger-text">{label}</span>
        <span className="study-trigger-icon" aria-hidden="true">ⓘ</span>
      </button>

      {isOpen && (
        <div
          id={`dialog-${id}`}
          role="dialog"
          aria-labelledby={`title-${id}`}
          className="study-popover floating-dark-popover"
          tabIndex={-1}
        >
          <div className="study-popover-header">
            <h3 id={`title-${id}`}>{title}</h3>
            <button
              type="button"
              className="study-popover-close text-button"
              aria-label="Close study note (Esc)"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="study-popover-body">
            {children}
          </div>
          <div className="study-popover-footer muted mono">
            Press Esc to dismiss
          </div>
        </div>
      )}
    </div>
  );
}
