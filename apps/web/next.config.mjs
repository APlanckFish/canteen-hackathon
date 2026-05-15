/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // wagmi/RainbowKit 通过 @metamask/sdk / @walletconnect 引入了一堆
    // React-Native-only 的可选依赖（async-storage、pino-pretty 等），
    // 在浏览器端打包时没必要解析，全部 alias 成 false。
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    // 避免 wagmi/walletconnect 在 server 端构建时尝试加载 indexedDB shim
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "pino-pretty",
        "encoding",
      ];
    }
    return config;
  },
};

export default nextConfig;
