// npx webpack

const path = require('path');

function makeConfig(environment, target) {
    return {
        target: target,
        mode: process.env.NODE_ENV || 'development',
        entry: './src/main.ts',
        output: {
            path: path.resolve(__dirname, 'build'),
            filename: environment + ".js"
        },
        module: {
        rules: [
                { 
                    test: /\.tsx?$/,
                    exclude: /node_modules/, 
                    loader: 'babel-loader'
                }
            ]
        },
        resolve: {
            extensions: [".ts", ".tsx"]
        },
        watch: true
    };
}

module.exports = [
    makeConfig('node')
];
