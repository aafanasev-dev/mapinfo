FROM alpine:3.20 AS fetch
WORKDIR /vendor
RUN wget -q https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js \
 && wget -q https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js \
 && wget -q https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js /usr/share/nginx/html/
COPY --from=fetch /vendor /usr/share/nginx/html/vendor
EXPOSE 80
