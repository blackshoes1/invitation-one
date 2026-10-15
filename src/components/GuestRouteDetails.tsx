import { ArrowUpRight, ParkingCircle, Phone } from "lucide-react";
import ParkingRouteMap from "@/components/ParkingRouteMap";
import { groom, parkingLot, venue } from "@/lib/wedding";

const actionClass = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sage-100 px-4 py-3 text-sm font-medium text-sage-800 transition-colors hover:bg-sage-200";
const mapActionClass = "flex min-h-12 min-w-0 items-center justify-center rounded-xl bg-sage-100 px-2 py-3 text-sm font-medium whitespace-nowrap text-sage-800 transition-colors hover:bg-sage-200";

export default function GuestRouteDetails() {
  return (
    <section aria-label="예식장 교통 및 주차 후 이동 안내" className="space-y-5">
      <article className="rounded-2xl border border-sage-200 bg-white p-4">
        <p className="mb-2 text-sm text-sage-600">대중교통 · 예식장 위치</p>
        <h2 className="text-lg font-medium">{venue.name} 야외예식장</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-sage-600">{venue.address.replace(" (", "\n(")}</p>
        <p className="mt-3 text-sm leading-relaxed text-sage-600">가급적 대중교통 이용을 권장드립니다. 지도에서 출발지를 설정해 대중교통 경로를 확인해 주세요.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={venue.nav.kakaoWeb} aria-label="카카오맵 예식장 위치 보기" target="_blank" rel="noopener noreferrer" className={mapActionClass}>카카오맵</a>
          <a href={venue.nav.naverWeb} aria-label="네이버 지도 예식장 위치 보기" target="_blank" rel="noopener noreferrer" className={mapActionClass}>네이버 지도</a>
        </div>
        {groom.phone && (
          <a href={`tel:${groom.phone.replaceAll("-", "")}`} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sage-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sage-800">
            <Phone size={16} aria-hidden="true" /> 신랑에게 전화하기
          </a>
        )}
      </article>
      <article className="rounded-2xl border border-sage-200 bg-white p-4">
        <p className="mb-2 text-sm text-sage-600">자차 · 주차 위치</p>
        <h2 className="text-lg font-medium">{parkingLot.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-sage-600">{parkingLot.address}</p>
        <p className="mt-3 text-sm leading-relaxed text-sage-600">박물관 사정에 따라 주차가 어려울 수 있으니 가급적 대중교통 이용을 권장드립니다.</p>
        <a href={parkingLot.nav.naverWeb} target="_blank" rel="noopener noreferrer" className={`${actionClass} mt-4`}>
          <ParkingCircle size={16} aria-hidden="true" /> 주차장 위치 보기 <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </article>
      <article className="rounded-2xl border border-sage-200 bg-white p-4">
        <p className="mb-2 text-sm text-sage-600">도보 · 주차 후 이동</p>
        <h2 className="mb-4 text-lg font-medium">주차 후 예식장 가는 길</h2>
        <div className="overflow-hidden rounded-xl"><ParkingRouteMap /></div>
        <p className="mt-3 text-sm leading-relaxed text-sage-600">지도에 표시된 선은 이동 방향을 나타내는 약도입니다. 정확한 보행 경로는 아래 지도에서 도보 경로를 선택해 확인해 주세요.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={parkingLot.walkNav.kakaoWeb} aria-label="카카오맵 길찾기" target="_blank" rel="noopener noreferrer" className={mapActionClass}>카카오맵</a>
          <a href={parkingLot.walkNav.naverWeb} aria-label="네이버 도보 길찾기" target="_blank" rel="noopener noreferrer" className={mapActionClass}>네이버 지도</a>
        </div>
      </article>
    </section>
  );
}
