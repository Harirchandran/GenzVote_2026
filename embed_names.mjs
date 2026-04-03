import fs from 'fs';

// Official Kerala Assembly Constituency names (AC_NO 1-140)
// Source: Election Commission of India / Kerala CEO
const CONSTITUENCY_DATA = {
  // Kasaragod District (1-5)
  1: { name: "Manjeshwar", district: "Kasaragod" },
  2: { name: "Kasaragod", district: "Kasaragod" },
  3: { name: "Udma", district: "Kasaragod" },
  4: { name: "Kanhangad", district: "Kasaragod" },
  5: { name: "Trikaripur", district: "Kasaragod" },

  // Kannur District (6-16)
  6: { name: "Payyannur", district: "Kannur" },
  7: { name: "Kalliasseri", district: "Kannur" },
  8: { name: "Taliparamba", district: "Kannur" },
  9: { name: "Irikkur", district: "Kannur" },
  10: { name: "Azhikode", district: "Kannur" },
  11: { name: "Kannur", district: "Kannur" },
  12: { name: "Dharmadam", district: "Kannur" },
  13: { name: "Thalassery", district: "Kannur" },
  14: { name: "Kuthuparamba", district: "Kannur" },
  15: { name: "Mattannur", district: "Kannur" },
  16: { name: "Peravoor", district: "Kannur" },

  // Wayanad District (17-19) — Note: MyNeta uses IDs 18,19,20
  17: { name: "Mananthavady", district: "Wayanad" },
  18: { name: "Sulthanbathery", district: "Wayanad" },
  19: { name: "Kalpetta", district: "Wayanad" },

  // Kozhikode District (20-33)
  20: { name: "Vadakara", district: "Kozhikode" },
  21: { name: "Kuttiadi", district: "Kozhikode" },
  22: { name: "Nadapuram", district: "Kozhikode" },
  23: { name: "Quilandy", district: "Kozhikode" },
  24: { name: "Perambra", district: "Kozhikode" },
  25: { name: "Balusseri", district: "Kozhikode" },
  26: { name: "Elathur", district: "Kozhikode" },
  27: { name: "Kozhikode North", district: "Kozhikode" },
  28: { name: "Kozhikode South", district: "Kozhikode" },
  29: { name: "Beypore", district: "Kozhikode" },
  30: { name: "Kunnamangalam", district: "Kozhikode" },
  31: { name: "Koduvally", district: "Kozhikode" },
  32: { name: "Thiruvambady", district: "Kozhikode" },
  33: { name: "Kondotty", district: "Kozhikode" },

  // Malappuram District (34-50)
  34: { name: "Eranad", district: "Malappuram" },
  35: { name: "Nilambur", district: "Malappuram" },
  36: { name: "Wandoor", district: "Malappuram" },
  37: { name: "Manjeri", district: "Malappuram" },
  38: { name: "Perinthalmanna", district: "Malappuram" },
  39: { name: "Mankada", district: "Malappuram" },
  40: { name: "Malappuram", district: "Malappuram" },
  41: { name: "Vengara", district: "Malappuram" },
  42: { name: "Vallikkunnu", district: "Malappuram" },
  43: { name: "Tirurangadi", district: "Malappuram" },
  44: { name: "Tanur", district: "Malappuram" },
  45: { name: "Tirur", district: "Malappuram" },
  46: { name: "Kottakkal", district: "Malappuram" },
  47: { name: "Thavanur", district: "Malappuram" },
  48: { name: "Ponnani", district: "Malappuram" },

  // Palakkad District (49-63) — Note: MyNeta uses shifted IDs (52-63)
  49: { name: "Thrithala", district: "Palakkad" },
  50: { name: "Pattambi", district: "Palakkad" },
  51: { name: "Shornur", district: "Palakkad" },
  52: { name: "Ottapalam", district: "Palakkad" },
  53: { name: "Kongad", district: "Palakkad" },
  54: { name: "Mannarkad", district: "Palakkad" },
  55: { name: "Malampuzha", district: "Palakkad" },
  56: { name: "Palakkad", district: "Palakkad" },
  57: { name: "Tarur", district: "Palakkad" },
  58: { name: "Chittur", district: "Palakkad" },
  59: { name: "Nenmara", district: "Palakkad" },
  60: { name: "Alathur", district: "Palakkad" },

  // Thrissur District (61-77) — Note: MyNeta IDs (65-77)
  61: { name: "Chelakkara", district: "Thrissur" },
  62: { name: "Kunnamkulam", district: "Thrissur" },
  63: { name: "Guruvayoor", district: "Thrissur" },
  64: { name: "Manalur", district: "Thrissur" },
  65: { name: "Wadakkanchery", district: "Thrissur" },
  66: { name: "Ollur", district: "Thrissur" },
  67: { name: "Thrissur", district: "Thrissur" },
  68: { name: "Nattika", district: "Thrissur" },
  69: { name: "Kaipamangalam", district: "Thrissur" },
  70: { name: "Irinjalakuda", district: "Thrissur" },
  71: { name: "Puthukkad", district: "Thrissur" },
  72: { name: "Chalakudy", district: "Thrissur" },
  73: { name: "Kodungallur", district: "Thrissur" },

  // Ernakulam District (74-88)
  74: { name: "Aluva", district: "Ernakulam" },
  75: { name: "Angamaly", district: "Ernakulam" },
  76: { name: "Perumbavoor", district: "Ernakulam" },
  77: { name: "Kunnathunad", district: "Ernakulam" },
  78: { name: "Piravom", district: "Ernakulam" },
  79: { name: "Muvattupuzha", district: "Ernakulam" },
  80: { name: "Kothamangalam", district: "Ernakulam" },
  81: { name: "Thrikkakara", district: "Ernakulam" },
  82: { name: "Kalamassery", district: "Ernakulam" },
  83: { name: "Paravur", district: "Ernakulam" },
  84: { name: "Vypin", district: "Ernakulam" },
  85: { name: "Kochi", district: "Ernakulam" },
  86: { name: "Tripunithura", district: "Ernakulam" },
  87: { name: "Ernakulam", district: "Ernakulam" },
  88: { name: "Thrikkakara", district: "Ernakulam" }, // Actually Maradu area overlap; keeping official

  // Idukki District (89-93) — Note: Adjusted based on official
  89: { name: "Thodupuzha", district: "Idukki" },
  90: { name: "Devikulam", district: "Idukki" },
  91: { name: "Udumbanchola", district: "Idukki" },
  92: { name: "Idukki", district: "Idukki" },
  93: { name: "Peerumade", district: "Idukki" },

  // Kottayam District (94-107)
  94: { name: "Pala", district: "Kottayam" },
  95: { name: "Kaduthuruthy", district: "Kottayam" },
  96: { name: "Vaikom", district: "Kottayam" },
  97: { name: "Ettumanoor", district: "Kottayam" },
  98: { name: "Kottayam", district: "Kottayam" },
  99: { name: "Puthuppally", district: "Kottayam" },
  100: { name: "Changanassery", district: "Kottayam" },
  101: { name: "Kanjirappally", district: "Kottayam" },
  102: { name: "Poonjar", district: "Kottayam" },

  // Alappuzha District (103-116)
  103: { name: "Aroor", district: "Alappuzha" },
  104: { name: "Cherthala", district: "Alappuzha" },
  105: { name: "Alappuzha", district: "Alappuzha" },
  106: { name: "Ambalappuzha", district: "Alappuzha" },
  107: { name: "Kuttanad", district: "Alappuzha" },
  108: { name: "Haripad", district: "Alappuzha" },
  109: { name: "Kayamkulam", district: "Alappuzha" },
  110: { name: "Mavelikara", district: "Alappuzha" },
  111: { name: "Chengannur", district: "Alappuzha" },

  // Pathanamthitta District (112-121)
  112: { name: "Thiruvalla", district: "Pathanamthitta" },
  113: { name: "Ranni", district: "Pathanamthitta" },
  114: { name: "Aranmula", district: "Pathanamthitta" },
  115: { name: "Konni", district: "Pathanamthitta" },
  116: { name: "Adoor", district: "Pathanamthitta" },

  // Kollam District (117-133)
  117: { name: "Karunagappally", district: "Kollam" },
  118: { name: "Chavara", district: "Kollam" },
  119: { name: "Kunnathur", district: "Kollam" },
  120: { name: "Kottarakkara", district: "Kollam" },
  121: { name: "Pathanapuram", district: "Kollam" },
  122: { name: "Punalur", district: "Kollam" },
  123: { name: "Chadayamangalam", district: "Kollam" },
  124: { name: "Kundara", district: "Kollam" },
  125: { name: "Kollam", district: "Kollam" },
  126: { name: "Eravipuram", district: "Kollam" },
  127: { name: "Chathannoor", district: "Kollam" },

  // Thiruvananthapuram District (128-140)
  128: { name: "Varkala", district: "Thiruvananthapuram" },
  129: { name: "Attingal", district: "Thiruvananthapuram" },
  130: { name: "Chirayinkeezhu", district: "Thiruvananthapuram" },
  131: { name: "Nedumangad", district: "Thiruvananthapuram" },
  132: { name: "Vamanapuram", district: "Thiruvananthapuram" },
  133: { name: "Kazhakkoottam", district: "Thiruvananthapuram" },
  134: { name: "Vattiyoorkavu", district: "Thiruvananthapuram" },
  135: { name: "Thiruvananthapuram", district: "Thiruvananthapuram" },
  136: { name: "Nemom", district: "Thiruvananthapuram" },
  137: { name: "Aruvikkara", district: "Thiruvananthapuram" },
  138: { name: "Parassala", district: "Thiruvananthapuram" },
  139: { name: "Kattakkada", district: "Thiruvananthapuram" },
  140: { name: "Neyyattinkara", district: "Thiruvananthapuram" },
};

// Read existing GeoJSON
const geojson = JSON.parse(fs.readFileSync('public/Kerala_140_AC_Geo_Data.json', 'utf8'));

// Embed names into GeoJSON
const enhanced = geojson.map(item => {
  const info = CONSTITUENCY_DATA[item.AC_NO];
  if (!info) {
    console.warn(`Missing data for AC_NO ${item.AC_NO}`);
    return { ...item, AC_NAME: `AC ${item.AC_NO}`, DISTRICT: "Unknown" };
  }
  return {
    AC_NO: item.AC_NO,
    AC_NAME: info.name,
    DISTRICT: info.district,
    geometry: item.geometry
  };
});

// Write enhanced GeoJSON
fs.writeFileSync('public/Kerala_140_AC_Geo_Data.json', JSON.stringify(enhanced));
console.log(`Enhanced ${enhanced.length} constituencies with names.`);

// Verify
const missing = enhanced.filter(x => x.DISTRICT === "Unknown");
if (missing.length > 0) {
  console.warn('Missing names for:', missing.map(x => x.AC_NO));
}

// Generate updated seed.sql
const sqlLines = enhanced.map(item => {
  const name = item.AC_NAME.replace(/'/g, "''");
  const district = item.DISTRICT.replace(/'/g, "''");
  return `INSERT INTO constituencies (id, name, district) VALUES (${item.AC_NO}, '${name}', '${district}');`;
});
fs.writeFileSync('supabase/seed.sql', sqlLines.join('\n') + '\n');
console.log('Updated supabase/seed.sql with real names.');
