import type { FarmZone, LatLng } from '../types'

/**
 * G1.4 — realistic zone polygons for five of the Negev fixtures.
 *
 * Rings are hand-drawn as offsets from each farm's own pin so they stay
 * glued to it if a fixture position is ever corrected. Scale sanity: at this
 * latitude 0.001° of latitude is ~111 m; a 420-dunam holding is ~650 m a
 * side, and the grazing areas run 3–10× that, matching the dunam figures the
 * same fixtures declare.
 */

const ring = (center: LatLng, offsets: Array<[number, number]>): LatLng[] =>
  offsets.map(([dLat, dLng]) => ({
    lat: +(center.lat + dLat).toFixed(6),
    lng: +(center.lng + dLng).toFixed(6),
  }))

const FARM_01: LatLng = { lat: 31.0583, lng: 34.6531 }
const FARM_02: LatLng = { lat: 30.8712, lng: 34.7954 }
const FARM_04: LatLng = { lat: 30.9824, lng: 34.7063 }
const FARM_06: LatLng = { lat: 30.6472, lng: 34.9218 }
const FARM_08: LatLng = { lat: 31.3591, lng: 35.0812 }
const FARM_13: LatLng = { lat: 31.052, lng: 34.6825 }
const FARM_14: LatLng = { lat: 31.335, lng: 34.64 }

export const FARM_ZONES: FarmZone[] = [
  // חוות רתם — 420 dunam holding, 3 100 dunam of grazing to the south-east.
  {
    id: 'zone-01',
    farmId: 'farm-01',
    kind: 'farm_boundary',
    ring: ring(FARM_01, [
      [0.0032, -0.0028],
      [0.0038, 0.0021],
      [0.0009, 0.0038],
      [-0.0027, 0.0026],
      [-0.0031, -0.0019],
      [-0.0006, -0.0035],
    ]),
  },
  {
    id: 'zone-02',
    farmId: 'farm-01',
    kind: 'grazing_area',
    ring: ring(FARM_01, [
      [-0.0027, 0.0026],
      [0.0009, 0.0038],
      [0.0041, 0.0102],
      [0.0012, 0.0189],
      [-0.0104, 0.0163],
      [-0.0141, 0.0074],
      [-0.0088, 0.0011],
    ]),
  },

  // חוות מעלה עבדת — a compact 650-dunam holding, no herd.
  {
    id: 'zone-03',
    farmId: 'farm-02',
    kind: 'farm_boundary',
    ring: ring(FARM_02, [
      [0.0041, -0.0022],
      [0.0044, 0.0031],
      [-0.0008, 0.0046],
      [-0.0042, 0.0018],
      [-0.0037, -0.0031],
    ]),
  },

  // חוות באר מלכה — 180 dunam of buildings, 6 400 dunam of open grazing.
  {
    id: 'zone-04',
    farmId: 'farm-04',
    kind: 'farm_boundary',
    ring: ring(FARM_04, [
      [0.0019, -0.0016],
      [0.0022, 0.0014],
      [-0.0004, 0.0024],
      [-0.0021, 0.0009],
      [-0.0016, -0.0019],
    ]),
  },
  {
    id: 'zone-05',
    farmId: 'farm-04',
    kind: 'grazing_area',
    ring: ring(FARM_04, [
      [0.0022, 0.0014],
      [0.0148, 0.0061],
      [0.0197, 0.0208],
      [0.0061, 0.0294],
      [-0.0138, 0.0247],
      [-0.0181, 0.0092],
      [-0.0067, -0.0004],
      [-0.0021, 0.0009],
    ]),
  },
  {
    id: 'zone-06',
    farmId: 'farm-04',
    kind: 'grazing_area',
    // A second, detached paddock west of the road — several polygons per
    // kind are allowed and the Negev farms really are split like this.
    ring: ring(FARM_04, [
      [0.0038, -0.0187],
      [0.0071, -0.0079],
      [-0.0009, -0.0041],
      [-0.0083, -0.0102],
      [-0.0041, -0.0181],
    ]),
  },

  // חוות נאות חלוצה — 4 800 dunam of grazing wrapping the holding.
  {
    id: 'zone-07',
    farmId: 'farm-06',
    kind: 'farm_boundary',
    ring: ring(FARM_06, [
      [0.0014, -0.0021],
      [0.0021, 0.0012],
      [-0.0006, 0.0022],
      [-0.0019, 0.0002],
      [-0.0012, -0.0018],
    ]),
  },
  {
    id: 'zone-08',
    farmId: 'farm-06',
    kind: 'grazing_area',
    ring: ring(FARM_06, [
      [0.0021, 0.0012],
      [0.0118, -0.0022],
      [0.0173, 0.0104],
      [0.0088, 0.0213],
      [-0.0074, 0.0198],
      [-0.0151, 0.0087],
      [-0.0078, -0.0031],
      [-0.0019, 0.0002],
    ]),
  },

  // חוות סנסנה — 3 900 dunam on the hills east of the pin.
  {
    id: 'zone-09',
    farmId: 'farm-08',
    kind: 'farm_boundary',
    ring: ring(FARM_08, [
      [0.0011, -0.0019],
      [0.0019, 0.0008],
      [0.0002, 0.0021],
      [-0.0017, 0.0011],
      [-0.0014, -0.0013],
    ]),
  },
  {
    id: 'zone-10',
    farmId: 'farm-08',
    kind: 'grazing_area',
    ring: ring(FARM_08, [
      [0.0019, 0.0008],
      [0.0102, 0.0044],
      [0.0131, 0.0159],
      [0.0018, 0.0221],
      [-0.0096, 0.0174],
      [-0.0119, 0.0058],
      [-0.0017, 0.0011],
    ]),
  },

  // G16 — מושב רתמים, drawn to ADJOIN חוות רתם: the moshav's grazing runs
  // west to ~34.672°, exactly where farm-01's grazing ends, so the blue and
  // green families sit side by side on the map (A55).
  {
    id: 'zone-11',
    farmId: 'farm-13',
    kind: 'farm_boundary',
    ring: ring(FARM_13, [
      [0.003, -0.002],
      [0.003, 0.003],
      [-0.001, 0.004],
      [-0.003, 0.002],
      [-0.003, -0.002],
      [0, -0.0035],
    ]),
  },
  {
    id: 'zone-12',
    farmId: 'farm-13',
    kind: 'grazing_area',
    ring: ring(FARM_13, [
      [0.006, -0.0105],
      [0.006, -0.003],
      [-0.006, -0.003],
      [-0.008, -0.0105],
    ]),
  },

  // G16 — מושב באר חיל: a village core and a modest field belt.
  {
    id: 'zone-13',
    farmId: 'farm-14',
    kind: 'farm_boundary',
    ring: ring(FARM_14, [
      [0.0028, -0.0022],
      [0.0032, 0.0024],
      [-0.0004, 0.0038],
      [-0.003, 0.0018],
      [-0.0026, -0.0024],
    ]),
  },
  {
    id: 'zone-14',
    farmId: 'farm-14',
    kind: 'grazing_area',
    ring: ring(FARM_14, [
      [0.0032, 0.0024],
      [0.0058, 0.0102],
      [-0.0021, 0.0141],
      [-0.0063, 0.0072],
      [-0.0004, 0.0038],
    ]),
  },
]
