const path = require('path');

// Load server/.env regardless of the working directory the process was started from.
require('dotenv').config({ path: path.join(__dirname, '.env') });

require('./src/server').start();
