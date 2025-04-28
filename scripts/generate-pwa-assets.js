import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create directories if they don't exist
const iconsDir = path.join(__dirname, '../public/icons');
const splashDir = path.join(__dirname, '../public/splash');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

if (!fs.existsSync(splashDir)) {
  fs.mkdirSync(splashDir, { recursive: true });
}

// Icon sizes needed for PWA
const iconSizes = [
  72, 96, 128, 144, 152, 192, 384, 512
];

// iOS specific icon sizes
const iosIconSizes = [
  120, 152, 167, 180
];

// Generate icons for manifest
iconSizes.forEach(size => {
  const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
  exec(`convert -background none -size ${size}x${size} ${path.join(iconsDir, 'icon.svg')} ${outputPath}`, 
    (error) => {
      if (error) {
        console.error(`Error generating ${size}x${size} icon:`, error);
      } else {
        console.log(`Generated ${outputPath}`);
      }
    }
  );
});

// Generate iOS specific icons
iosIconSizes.forEach(size => {
  const outputPath = path.join(iconsDir, `apple-icon-${size}x${size}.png`);
  exec(`convert -background none -size ${size}x${size} ${path.join(iconsDir, 'icon.svg')} ${outputPath}`, 
    (error) => {
      if (error) {
        console.error(`Error generating ${size}x${size} iOS icon:`, error);
      } else {
        console.log(`Generated ${outputPath}`);
      }
    }
  );
});

// Generate a badge icon for notifications
exec(`convert -background none -size 72x72 ${path.join(iconsDir, 'icon.svg')} ${path.join(iconsDir, 'badge-72x72.png')}`, 
  (error) => {
    if (error) {
      console.error('Error generating badge icon:', error);
    } else {
      console.log(`Generated badge icon`);
    }
  }
);

// iOS splash screen sizes
const splashScreens = [
  { width: 2048, height: 2732 }, // iPad Pro 12.9"
  { width: 1668, height: 2388 }, // iPad Pro 11"
  { width: 1668, height: 2224 }, // iPad Pro 10.5"
  { width: 1536, height: 2048 }, // iPad Mini/Air
  { width: 1242, height: 2688 }, // iPhone XS Max
  { width: 1125, height: 2436 }, // iPhone X/XS
  { width: 828, height: 1792 },  // iPhone XR
  { width: 750, height: 1334 },  // iPhone 8/7/6s/6
  { width: 640, height: 1136 }   // iPhone SE
];

// Generate splash screens with the app logo in the center
splashScreens.forEach(({ width, height }) => {
  const outputPath = path.join(splashDir, `apple-splash-${width}-${height}.png`);
  // Create a splash screen with a gradient background and the app logo in the center
  exec(`convert -size ${width}x${height} gradient:#6B46C1-#9F7AEA \\
    \\( ${path.join(iconsDir, 'icon.svg')} -resize $((${width} / 3))x$((${height} / 3)) \\) -gravity center -composite \\
    ${outputPath}`, 
    (error) => {
      if (error) {
        console.error(`Error generating ${width}x${height} splash screen:`, error);
      } else {
        console.log(`Generated ${outputPath}`);
      }
    }
  );
});

console.log('PWA asset generation initiated. This may take a moment to complete...');