# This Docker container is used for testing on GCB.
ARG GOVERSION=1
FROM golang:${GOVERSION} AS gobuilder

ENV GO111MODULE on
ENV GOBIN /gobin

# Install other Go tools tests depend on
RUN mkdir -p /scratch/installtools
ADD tools/installtools/main.go /scratch/installtools/main.go
RUN go run /scratch/installtools/main.go

FROM node:latest

# Prepare a home directory under workspace.
RUN mkdir -p /workspace/vscodego
ENV HOME=/workspace/vscodego

# GO111MODULE=auto
RUN mkdir /go
COPY --from=gobuilder /gobin /go/bin
COPY --from=gobuilder /usr/local/go /usr/local/go

# Add the default GOPATH/bin to the PATH.
# Add the directories of the go tool chains to PATH.
ENV PATH /workspace/vscodego/go/bin:/go/bin:/usr/local/go/bin:${PATH}
ENV DEBIAN_FRONTEND noninteractive

RUN apt-get -qq update && apt-get install -qq -y libnss3 libgtk-3-dev libxss1 libasound2 xvfb libsecret-1-0 jq > /dev/null
RUN npm install -g typescript vsce

WORKDIR /workspace
ENTRYPOINT ["build/all.bash"]
