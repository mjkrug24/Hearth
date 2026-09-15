import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests',testMatch:'**/*.spec.js',workers:1,
 use:{baseURL:'http://localhost:3107',timezoneId:'America/Chicago',viewport:{width:1440,height:1000}},
 webServer:{command:'node server.js',url:'http://localhost:3107',env:{PORT:'3107',APP_BASE_URL:'http://localhost:3107'},reuseExistingServer:false}
});
