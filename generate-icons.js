const sharp = require('sharp');
const fs = require('fs');

const SIZES = [16, 48, 128];
const INPUT_SVG = 'icons/icon.svg';
const OUTPUT_DIR = 'icons';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR);
}

console.log('🖼️  Generating icons from SVG...');

SIZES.forEach(size => {
  const outputFileName = `${OUTPUT_DIR}/icon${size}.png`;
  
  sharp(INPUT_SVG)
    .resize(size, size)
    .png()
    .toFile(outputFileName, (err, info) => {
      if (err) {
        console.error(`Error generating ${outputFileName}:`, err);
      } else {
        console.log(`✅ Generated ${outputFileName}`);
      }
    });
}); 