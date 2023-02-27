FROM node:18-bullseye
RUN apt update && apt upgrade -y
RUN apt install -y pip --no-install-recommends
RUN apt install -y --no-install-recommends ffmpeg libsm6 libxext6 curl gnupg
RUN apt install -y --no-install-recommends software-properties-common apt-transport-https wget ca-certificates gnupg2
# Install microsoft-edge
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
RUN install -o root -g root -m 644 microsoft.gpg /etc/apt/trusted.gpg.d/
RUN sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge-dev.list'
RUN rm microsoft.gpg
RUN apt update
RUN apt install microsoft-edge-stable -y --no-install-recommends 
RUN rm -rf /var/lib/apt/lists/*
RUN apt clean
# Setup app folder and install node dependencies
RUN git clone https://github.com/sheep-o/math5.git /app
WORKDIR /app
COPY . ./
RUN python3 -m pip install editdistance
RUN python3 -m pip install lmdb
RUN python3 -m pip install matplotlib
RUN python3 -m pip install numpy
RUN python3 -m pip install opencv-python
RUN python3 -m pip install path
RUN python3 -m pip install tensorflow
RUN python3 -m pip cache purge
RUN npm ci
EXPOSE 3000
CMD node .