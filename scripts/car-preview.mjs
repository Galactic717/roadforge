// Optional standalone asset QA. Start Vite on port 5191, then run this script.
// The temporary page is removed after capture so it never ships as product UI.
import { chromium } from 'playwright';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const filename = `.car-preview-${process.pid}.html`;
const pagePath = fileURLToPath(new URL(`../web/${filename}`, import.meta.url));
const html = "<!doctype html><html><head><style>html,body,#v{margin:0;width:100%;height:100%;overflow:hidden}.cesium-widget-credits{display:none}</style></head><body><div id=\"v\"></div><script type=\"module\">\nimport * as C from 'cesium';\nimport {createCar} from './src/car.js';\nconst viewer = new C.Viewer('v',{baseLayer:false,animation:false,timeline:false,geocoder:false,homeButton:false,navigationHelpButton:false,baseLayerPicker:false,sceneModePicker:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,skyBox:false,skyAtmosphere:false});\nviewer.scene.globe.show=false; viewer.scene.backgroundColor=C.Color.fromCssColorString('#c3c9ce');\nviewer.scene.screenSpaceCameraController.enableCollisionDetection=false;\nviewer.scene.highDynamicRange=true;viewer.scene.postProcessStages.fxaa.enabled=true;\nviewer.scene.light=new C.DirectionalLight({direction:new C.Cartesian3(-.4,-.3,-1),intensity:2.6});\nconst car=createCar(viewer);car.update({lon:0,lat:0,height:0,heading:0,speed:0,steer:0});\nconst frame=C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0,0,0));\nconst rot=C.Matrix4.getMatrix3(frame,new C.Matrix3());\nviewer.entities.add({position:C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(0,0,-.10),new C.Cartesian3()),orientation:C.Quaternion.fromRotationMatrix(rot),box:{dimensions:new C.Cartesian3(200,200,.16),material:C.Color.fromCssColorString('#909395')}});\nwindow.viewCar=(front=true)=>{const eye=C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(front?6:-6,-6,3.0),new C.Cartesian3()); const target=C.Matrix4.multiplyByPoint(frame,new C.Cartesian3(0,0,.65),new C.Cartesian3()); const direction=C.Cartesian3.normalize(C.Cartesian3.subtract(target,eye,new C.Cartesian3()),new C.Cartesian3());viewer.camera.setView({destination:eye,orientation:{direction,up:new C.Cartesian3(1,0,0)}});viewer.camera.frustum.fov=C.Math.toRadians(41)};window.viewCar(true);\n</script></body></html>\n";
let browser;
try {
  await writeFile(pagePath, html);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.CAR_PREVIEW_URL || 'http://127.0.0.1:5191'}/${filename}`);
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'docs/car-front.png' });
  await page.evaluate(() => window.viewCar(false));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/car-rear.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Car front and rear rendered without page errors.');
} finally {
  await browser?.close();
  await unlink(pagePath).catch(() => {});
}
