FROM node:14.16 as build-env

WORKDIR /root/app
COPY ./ /root/app/

RUN cd projects/symbol
RUN npm i
RUN npm run build

FROM node:14.16-alpine

WORKDIR /root/app
COPY --from=build-env /root/app/projects/symbol/dist/ /root/app/
