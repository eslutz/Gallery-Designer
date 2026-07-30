import { Info } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  avoidTooltipCollisions,
  calculateTooltipPosition,
  getStagedPreviewObstacles,
  getTooltipElementSize,
  type TooltipPosition,
} from '../lib/tooltipPosition';

export function ToggleFieldWithInfo({
  label,
  checked,
  info,
  onChange,
}: {
  label: string;
  checked: boolean;
  info: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="toggle-field-with-info">
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      <InfoTooltipButton label={label} info={info} />
    </div>
  );
}

export function InfoTooltipButton({ label, info }: { label: string; info: string }) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(() =>
    calculateTooltipPosition(
      { left: 0, top: 0, width: 0, height: 0 },
      { width: 240, height: 0 },
      { width: 1024, height: 768 },
    ),
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltip = tooltipRef.current;

    if (!button || !tooltip || typeof window === 'undefined') {
      return;
    }

    const triggerRect = button.getBoundingClientRect();
    const tooltipSize = getTooltipElementSize(tooltip);
    const visualViewport = window.visualViewport;
    const viewport = {
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const nextPosition = calculateTooltipPosition(
      {
        left: triggerRect.left - viewportOffsetLeft,
        top: triggerRect.top - viewportOffsetTop,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      {
        width: tooltipSize.width || 240,
        height: tooltipSize.height || 0,
      },
      viewport,
    );
    setPosition({
      ...nextPosition,
      left: nextPosition.left + viewportOffsetLeft,
      top: nextPosition.top + viewportOffsetTop,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, info, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    visualViewport?.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      visualViewport?.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, info, updatePosition]);

  return (
    <span
      className="info-tip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="info-button"
        aria-label={`${label} information`}
        aria-describedby={tooltipId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {createPortal(
        <span
          ref={tooltipRef}
          className={`info-tooltip${isOpen ? ' info-tooltip-open' : ''}`}
          data-placement={position.placement}
          id={tooltipId}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
          }}
        >
          {info}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function TooltipIconButton({
  ariaLabel,
  tooltip,
  children,
  onClick,
  buttonClassName = 'icon-button',
  className,
  wrapperClassName,
  onPointerDown,
}: {
  ariaLabel: string;
  tooltip: string;
  children: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  buttonClassName?: string;
  className?: string;
  wrapperClassName?: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(() =>
    calculateTooltipPosition(
      { left: 0, top: 0, width: 0, height: 0 },
      { width: 180, height: 0 },
      { width: 1024, height: 768 },
    ),
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltipElement = tooltipRef.current;

    if (!button || !tooltipElement || typeof window === 'undefined') {
      return;
    }

    const triggerRect = button.getBoundingClientRect();
    const tooltipSize = getTooltipElementSize(tooltipElement);
    const visualViewport = window.visualViewport;
    const viewport = {
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const nextPosition = calculateTooltipPosition(
      {
        left: triggerRect.left - viewportOffsetLeft,
        top: triggerRect.top - viewportOffsetTop,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      {
        width: tooltipSize.width || 180,
        height: tooltipSize.height || 0,
      },
      viewport,
    );
    const resolvedPosition = wrapperClassName?.includes('staged-remove-anchor')
      ? avoidTooltipCollisions(
          nextPosition,
          tooltipSize,
          getStagedPreviewObstacles(button, viewportOffsetLeft, viewportOffsetTop),
          viewport,
        )
      : nextPosition;

    setPosition({
      ...resolvedPosition,
      left: resolvedPosition.left + viewportOffsetLeft,
      top: resolvedPosition.top + viewportOffsetTop,
    });
  }, [wrapperClassName]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, tooltip, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    visualViewport?.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      visualViewport?.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, tooltip, updatePosition]);

  return (
    <span
      className={
        wrapperClassName ? `action-tooltip-anchor ${wrapperClassName}` : 'action-tooltip-anchor'
      }
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className={className ? `${buttonClassName} ${className}` : buttonClassName}
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
        onPointerDown={onPointerDown}
        onClick={(event) => {
          // On touch devices, tapping fires focus (opening the tooltip) and
          // click at once, and nothing normally blurs the button afterward —
          // e.g. these drawer-opening buttons don't steal focus when they
          // open — so the tooltip would otherwise stay rendered on top of
          // whatever the click just did.
          setIsOpen(false);
          onClick(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        {children}
      </button>
      {createPortal(
        <span
          ref={tooltipRef}
          className={`info-tooltip action-tooltip${isOpen ? ' info-tooltip-open' : ''}`}
          data-placement={position.placement}
          id={tooltipId}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
          }}
        >
          {tooltip}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function FieldLabelWithInfo({
  htmlFor,
  label,
  info,
}: {
  htmlFor: string;
  label: string;
  info?: string;
}) {
  return (
    <span className="field-label-with-info">
      <label htmlFor={htmlFor}>{label}</label>
      {info ? <InfoTooltipButton label={label} info={info} /> : null}
    </span>
  );
}

export function HeadingWithInfo({ label, info }: { label: string; info: string }) {
  return (
    <div className="heading-with-info">
      <h3>{label}</h3>
      <InfoTooltipButton label={label} info={info} />
    </div>
  );
}
