import http from 'node:http';
import https from 'node:https';

import realFetch from "node-fetch";

const httpAgent = new http.Agent({
	keepAlive: true
});
const httpsAgent = new https.Agent({
	keepAlive: true
});

const baseOptions = {
	agent: function(_parsedURL) {
		if (_parsedURL.protocol == 'http:') {
			return httpAgent;
		} else {
			return httpsAgent;
		}
	}
};


export default async function fetch(url: string, options = {}){
    return realFetch(url, {
        ...baseOptions,
        ...options
    });
}