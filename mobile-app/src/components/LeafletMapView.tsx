import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface Props {
  userLocation: LocationCoords | null;
  sedeLocation: {
    latitude: number;
    longitude: number;
    nombre: string;
  };
  height?: number;
}

export const LeafletMapView: React.FC<Props> = ({ userLocation, sedeLocation, height = 280 }) => {
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = useState<string | null>(null);
  const [durationMin, setDurationMin] = useState<string | null>(null);

  // Consultar OSRM Foot Routing API para calcular el tramo a pie real por las calles
  useEffect(() => {
    if (!userLocation || !sedeLocation) return;

    let isMounted = true;
    const fetchFootRoute = async () => {
      try {
        const uLat = userLocation.latitude;
        const uLng = userLocation.longitude;
        const sLat = sedeLocation.latitude;
        const sLng = sedeLocation.longitude;

        const baseUrl = process.env.EXPO_PUBLIC_OSRM_URL || 'https://router.project-osrm.org';
        const primaryUrl = `${baseUrl}/route/v1/foot/${uLng},${uLat};${sLng},${sLat}?overview=full&geometries=geojson`;

        let res = null;
        try {
          res = await fetch(primaryUrl);
        } catch (_e) {
          // If primary URL fails (e.g. local Docker not reachable), fallback to public OSRM API
          if (baseUrl !== 'https://router.project-osrm.org') {
            const fallbackUrl = `https://router.project-osrm.org/route/v1/foot/${uLng},${uLat};${sLng},${sLat}?overview=full&geometries=geojson`;
            res = await fetch(fallbackUrl);
          }
        }

        if (res && res.ok) {
          const data = await res.json();
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]); // [lat, lng]
            if (isMounted) {
              setRoutePolyline(coords);
              setDistanceKm((route.distance / 1000).toFixed(2));
              setDurationMin(Math.round(route.duration / 60).toString());
            }
            return;
          }
        }
      } catch (_e) {
        // Fallback a línea recta si la red OSRM falla
        if (isMounted && userLocation) {
          setRoutePolyline([
            [userLocation.latitude, userLocation.longitude],
            [sedeLocation.latitude, sedeLocation.longitude],
          ]);
        }
      }
    };

    fetchFootRoute();
    return () => {
      isMounted = false;
    };
  }, [userLocation?.latitude, userLocation?.longitude, sedeLocation.latitude, sedeLocation.longitude]);

  // Generar HTML estático para Leaflet
  const generateHtml = () => {
    const userLat = userLocation ? userLocation.latitude : sedeLocation.latitude;
    const userLng = userLocation ? userLocation.longitude : sedeLocation.longitude;
    const sLat = sedeLocation.latitude;
    const sLng = sedeLocation.longitude;

    const polylineJson = JSON.stringify(routePolyline);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e5e7eb; touch-action: auto; }
          .user-dot {
            width: 16px; height: 16px; background: #3E6AE1; border: 3px solid #ffffff;
            border-radius: 50%; box-shadow: 0 0 10px rgba(62,106,225,0.6);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: true, attributionControl: false, dragging: true, touchZoom: true, doubleClickZoom: true, scrollWheelZoom: true });
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
          }).addTo(map);

          const sedeIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
          });

          const userIcon = L.divIcon({
            className: 'user-dot',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });

          const sedeMarker = L.marker([${sLat}, ${sLng}], { icon: sedeIcon })
            .addTo(map)
            .bindPopup("<b>${sedeLocation.nombre.replace(/"/g, '')}</b><br>Sede Asignada");

          ${userLocation ? `
            const userMarker = L.marker([${userLat}, ${userLng}], { icon: userIcon })
              .addTo(map)
              .bindPopup("<b>Tu Ubicación GPS</b>");
          ` : ''}

          const routeCoords = ${polylineJson};
          if (routeCoords && routeCoords.length > 0) {
            const polyline = L.polyline(routeCoords, {
              color: '#3E6AE1',
              weight: 5,
              opacity: 0.85,
              dashArray: '8, 8'
            }).addTo(map);

            map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
          } else {
            const bounds = L.latLngBounds([
              [${userLat}, ${userLng}],
              [${sLat}, ${sLng}]
            ]);
            map.fitBounds(bounds, { padding: [30, 30] });
          }
        </script>
      </body>
      </html>
    `;
  };

  const openWaze = () => {
    const lat = sedeLocation.latitude;
    const lng = sedeLocation.longitude;
    const wazeAppUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
    const wazeWebUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

    Linking.canOpenURL(wazeAppUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(wazeAppUrl);
        } else {
          Linking.openURL(wazeWebUrl);
        }
      })
      .catch(() => {
        Linking.openURL(wazeWebUrl);
      });
  };

  const openGoogleMaps = () => {
    const lat = sedeLocation.latitude;
    const lng = sedeLocation.longitude;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    Linking.openURL(mapsUrl);
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: generateHtml() }}
        style={styles.webview}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* Info bar del tramo a pie */}
      {distanceKm && (
        <View style={styles.infoBar}>
          <Ionicons name="walk-outline" size={16} color="#3E6AE1" />
          <Text style={styles.infoText}>
            Tramo a pie: <Text style={{ fontWeight: '700', color: '#171A20' }}>{distanceKm} km</Text> (~{durationMin} min)
          </Text>
        </View>
      )}

      {/* Botones para navegar externamente */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.wazeBtn} onPress={openWaze} activeOpacity={0.85}>
          <Ionicons name="navigate-circle" size={18} color="#FFFFFF" />
          <Text style={styles.wazeBtnText}>NAVEGAR CON WAZE</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gmapsBtn} onPress={openGoogleMaps} activeOpacity={0.85}>
          <Ionicons name="map" size={16} color="#3E6AE1" />
          <Text style={styles.gmapsBtnText}>GOOGLE MAPS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  webview: {
    flex: 1,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  infoText: {
    fontSize: 12,
    color: '#5C5E62',
  },
  actionsRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  wazeBtn: {
    flex: 1,
    backgroundColor: '#33CCFF', // Waze Blue
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  wazeBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  gmapsBtn: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3E6AE1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gmapsBtnText: {
    color: '#3E6AE1',
    fontWeight: '700',
    fontSize: 12,
  },
});
