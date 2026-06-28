import React from 'react';
import Image from 'next/image';
import ScanActionPortal from './ScanActionPortal';
import { useRouter } from 'next/navigation';

interface ScanActionPopupProps {
  visible: boolean;
  onClose: () => void;
  onRequestCollect: () => void;
  onShareInPerson: () => void;
}

const ScanActionPopup: React.FC<ScanActionPopupProps> = ({
  visible,
  onClose,
  onShareInPerson,
}) => {
  const router = useRouter();

  if (!visible) return null;

  const popup = (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-end justify-center pb-20 pointer-events-auto"
    onClick={onClose}
    >
      <div className="bg-primary-500 w-full max-w-md rounded-3xl px-6 py-4 shadow-xl mx-4 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-stretch">
          <div
            className="relative flex-1 min-h-[112px] cursor-pointer text-white px-4 pt-4 pb-6"
            onClick={() => {
              onClose();
              router.push('/QRScanner'); 
            }}
          >
            <Image
              src="/assets/qrscan.png"
              alt="Scan QR"
              width={34}
              height={34}
              className="absolute top-3 right-3 w-7 h-7 object-contain"
            />
            <div className="flex h-full flex-col justify-end text-left mt-2">
              <div className="text-sm font-medium">Respond</div>
              <div className="text-sm font-medium">or Collect</div>
            </div>
          </div>

          <div className="w-px bg-white/30 mx-2 my-2"></div>

          <div
            className="relative flex-1 min-h-[112px] cursor-pointer text-white px-4 pt-4 pb-6"
            onClick={onShareInPerson}
          >
            <Image
              src="/assets/shareperson.png"
              alt="Share in person"
              width={34}
              height={34}
              className="absolute top-3 right-3 w-7 h-7 object-contain"
            />
            <div className="flex h-full flex-col justify-end text-left mt-2">
              <div className="text-sm font-medium">Share</div>
              <div className="text-sm font-medium">In-Person</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return <ScanActionPortal>{popup}</ScanActionPortal>;
};

export default ScanActionPopup;
