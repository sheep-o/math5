FROM node:18-bullseye
RUN mkdir app
WORKDIR /app
COPY . ./
RUN npm ci
RUN apt update
RUN apt upgrade -y
RUN apt install -y pip --no-install-recommends
RUN apt install -y --no-install-recommends ffmpeg libsm6 libxext6
RUN pip install opencv-python
RUN pip cache purge
RUN apt clean
EXPOSE 3000
CMD node .