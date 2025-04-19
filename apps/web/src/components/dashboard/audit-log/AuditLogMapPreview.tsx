'use client';
import '@/styles/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

const customIcon = L.icon({
  iconUrl: '/marker.svg',
  iconSize: [60, 60],
  iconAnchor: [30, 50],
});

interface AuditLogMapPreviewProps {
  latitude: number;
  longitude: number;
}

export default function AuditLogMapPreview({
  latitude,
  longitude,
}: AuditLogMapPreviewProps) {
  const position: [number, number] = [latitude, longitude];

  return (
    <MapContainer center={position} zoom={13}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker icon={customIcon} position={position} />
    </MapContainer>
  );
}
