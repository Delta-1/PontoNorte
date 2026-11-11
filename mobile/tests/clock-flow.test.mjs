import assert from "node:assert/strict";
import test from "node:test";
import {preferredMethod,nextClockEvent} from "../src/clock-flow.ts";
import {updateManifest} from "../scripts/update-manifest.mjs";
test("the employee gets one primary method, prioritizing the button then QR",()=>{
 assert.equal(preferredMethod([{method:"face",enabled:true},{method:"qr_code",enabled:true},{method:"mobile",enabled:true}]),"mobile");
 assert.equal(preferredMethod([{method:"mobile",enabled:false},{method:"qr_code",enabled:true}]),"qr_code");
 assert.equal(preferredMethod([{method:"face",enabled:true}]),undefined);
});
test("the next action progresses through the workday and ends after four records",()=>{
 const types=["entry","break_start","break_end","exit"];
 for(let count=0;count<=4;count++)assert.equal(nextClockEvent(types.slice(0,count).map(event_type=>({event_type,status:"valid"}))),types[count]??null);
 assert.equal(nextClockEvent([{event_type:"entry",status:"rejected"}]),"entry");
});
test("update metadata pins the APK, version, signature and immutable download",()=>{
 const manifest=updateManifest({bytes:Buffer.from("example apk"),versionCode:1005,versionName:"1.2.0",certificateSha256:"a".repeat(64),commit:"b".repeat(40)});
 assert.equal(manifest.url,"https://github.com/Delta-1/PontoNorte/releases/download/android-v1005/PontoNorte.apk");assert.equal(manifest.size,11);assert.match(manifest.sha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>updateManifest({bytes:Buffer.from("apk"),versionCode:1,versionName:"1",certificateSha256:"bad",commit:"bad"}));
});
