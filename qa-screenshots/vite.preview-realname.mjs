// 临时 vite preview 配置(后端不可用时的 UI 自测):静态托管 dist_stage2/R,/api 代理到 mock 4190
// 预览只做静态托管与代理,无需插件与别名
export default {
  preview: {
    host: '127.0.0.1',
    port: 4189,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4190',
        changeOrigin: true,
      },
    },
  },
}
