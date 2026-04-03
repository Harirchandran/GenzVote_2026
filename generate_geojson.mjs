import fs from 'fs';

// Kerala rough bounding box:
const minLng = 74.8;
const maxLng = 77.4;
const minLat = 8.2;
const maxLat = 12.8;

const cols = 10;
const rows = 14;

const dlng = (maxLng - minLng) / cols;
const dlat = (maxLat - minLat) / rows;

const features = [];
let id = 1;
const sqlInserts = [];

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const lng1 = minLng + c * dlng;
    const lat1 = minLat + r * dlat;
    const lng2 = lng1 + dlng;
    const lat2 = lat1 + dlat;
    
    // Create a polygon (rectangle)
    const polygon = [
      [
        [lng1, lat1],
        [lng2, lat1],
        [lng2, lat2],
        [lng1, lat2],
        [lng1, lat1],
      ]
    ];
    
    const name = `Constituency ${id}`;
    const district = `District ${Math.ceil(id / 10)}`;
    
    features.push({
      type: 'Feature',
      properties: {
        id: id,
        name: name,
        district: district,
      },
      geometry: {
        type: 'Polygon',
        coordinates: polygon
      }
    });

    sqlInserts.push(`INSERT INTO constituencies (id, name, district) VALUES (${id}, '${name}', '${district}');`);
    
    id++;
  }
}

const geojson = {
  type: 'FeatureCollection',
  features: features
};

fs.writeFileSync('public/kerala_constituencies.geojson', JSON.stringify(geojson));
fs.writeFileSync('supabase/seed.sql', sqlInserts.join('\n'));

console.log('Successfully generated 140 mock constituencies.');
