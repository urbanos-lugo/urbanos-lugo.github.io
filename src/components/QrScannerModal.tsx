import { useEffect, useRef, useState } from 'react';
import { QrCode, ArrowRight, Camera, CameraOff } from 'lucide-react';
import { MAX_QUERY_LENGTH } from '../utils/searchUtils';
import { useDialog } from '../hooks/useDialog';
import { useT } from '../i18n';
import { BusStop } from '../types';
import { BUS_STOPS } from '../data/transitData';
import { findStop } from '../utils/places';
import { CloseButton, Notice } from './ui/controls';
import { DialogTitle } from './ui/DialogTitle';
import { SectionLabel } from './ui/SectionLabel';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStop: (stop: BusStop) => void;
}

/** The browser's own BarcodeDetector (Chromium, where people actually scan a pole); elsewhere the manual entry is the whole feature. */
const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
const hasBarcodeDetector = Detector !== undefined;

/** Pull a stop code out of whatever the QR encodes: a bare code, or a URL ending in one. */
function extractStopCode(raw: string): string {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get('parada') || url.searchParams.get('stop') || url.searchParams.get('ps') || url.searchParams.get('qr');
    if (fromQuery) return fromQuery;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // Not a URL; fall through to the raw text.
  }
  const parts = text.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : text;
}

export function QrScannerModal({ isOpen, onClose, onSelectStop }: QrScannerModalProps) {
  const t = useT();
  const [inputCode, setInputCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dialogRef = useDialog(isOpen, onClose);

  const found = (stop: BusStop) => {
    onSelectStop(stop);
    onClose();
  };
  const lookup = (code = inputCode) => {
    const stop = findStop(extractStopCode(code));
    if (stop) found(stop);
    else setErrorMsg(t.qr.notFound);
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  };

  // Scan loop: runs only while the modal is open and the camera is on.
  useEffect(() => {
    if (!isScanning || !Detector) return;
    let cancelled = false;
    let frame = 0;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const stop = codes.length ? findStop(extractStopCode(codes[0].rawValue)) : undefined;
            if (stop) {
              stopCamera();
              return found(stop);
            }
          } catch {
            // A dropped frame is not worth aborting the scan.
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setCameraError(t.qr.cameraDenied);
          setIsScanning(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [isScanning]);

  // Never leave the camera running behind a closed modal.
  useEffect(() => {
    if (!isOpen) stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  // Example stops, from the data instead of ids that go stale; only ones that really carry a printed code.
  const demos = BUS_STOPS.filter((s) => s.officialToken)
    .sort((a, b) => b.lines.length - a.lines.length)
    .slice(0, 5);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.qr.title} className="anim-fade-full fixed inset-0 z-dialog overflow-y-auto bg-scrim flex items-center justify-center py-4 px-cap-4">
      <div className="anim-scale-in bg-bg rounded-card max-w-dialog w-full py-6 px-cap-6 shadow-overlay border border-edge relative">
        <CloseButton
          label={t.qr.close}
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-3.5 right-3.5"
        />

        {/* Clear of the close button over the corner, and wrapping: at 200% text the heading ran
            68 px past the card, under the button. */}
        <DialogTitle icon={QrCode} tone="accent" title={t.qr.title} subtitle={t.qr.subtitle} className="mb-4 pr-11" />

        {isScanning && (
          <div className="relative rounded-control overflow-hidden bg-ink mb-3 aspect-camera">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 border-heavy border-on-camera/frame m-10 rounded-control pointer-events-none" />
            <span className="absolute bottom-2 inset-x-0 text-center text-label font-bold text-on-camera drop-shadow-on-camera">{t.qr.scanning}</span>
          </div>
        )}

        <button
          onClick={() => {
            setCameraError('');
            isScanning ? stopCamera() : setIsScanning(true);
          }}
          disabled={!hasBarcodeDetector}
          className="btn btn-secondary mb-3 w-full"
        >
          {hasBarcodeDetector ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          <span>{hasBarcodeDetector ? (isScanning ? t.qr.stopScan : t.qr.scanBtn) : t.qr.noCamera}</span>
        </button>
        {cameraError && (
          <p role="alert" className="field-error mb-2">
            {cameraError}
          </p>
        )}

        <div className="space-y-3">
          <input
            id="qr-manual-input"
            type="text"
            value={inputCode}
            onChange={(e) => {
              setInputCode(e.target.value);
              setErrorMsg('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={t.qr.placeholder}
            // A name that stays when the example text goes, and the error said and tied to the
            // field: it appeared under it in silence, with nothing on the field to say why.
            aria-label={t.qr.inputLabel}
            aria-invalid={errorMsg ? true : undefined}
            aria-describedby={errorMsg ? 'qr-manual-error' : undefined}
            className="field"
          />
          {errorMsg && (
            <p id="qr-manual-error" role="alert" className="field-error">
              {errorMsg}
            </p>
          )}
          <button onClick={() => lookup()} className="btn btn-primary w-full">
            <span>{t.qr.searchBtn}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-line">
          <SectionLabel className="mb-2">{t.qr.popularDemos}</SectionLabel>
          <div className="space-y-1.5">
            {demos.map((stop) => (
              <button
                key={stop.id}
                onClick={() => {
                  setInputCode(stop.code);
                  lookup(stop.code);
                }}
                className="row-button group"
              >
                <span className="min-w-0 break-words font-semibold text-ink group-hover:text-accent">{stop.name}</span>
                <span className="font-mono text-accent font-bold shrink-0">{stop.code}</span>
              </button>
            ))}
          </div>
        </div>

        <Notice className="mt-4">{t.qr.howItWorks}</Notice>
      </div>
    </div>
  );
}
