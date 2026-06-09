FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm install --production

# 复制源码
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3001

# 数据库文件持久化挂载点
VOLUME ["/app/data"]

# 启动命令
CMD ["node", "server.js"]
