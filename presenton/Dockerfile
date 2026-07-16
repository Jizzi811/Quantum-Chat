FROM ghcr.io/presenton/presenton:latest

# The Diploi Static Website component exposes port 3000.
RUN sed -i 's/listen 80;/listen 3000;/' /etc/nginx/nginx.conf

EXPOSE 3000
