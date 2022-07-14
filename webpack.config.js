// npx webpack

const path = require('path');

function makeConfig(environment, target) {
    return {
        target: target,
        mode: 'development',
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
            extensions: [".ts", ".tsx", ".js"]
        },
        watch: true
    };
}

module.exports = [
    makeConfig('server', 'node')
];
