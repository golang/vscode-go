# This Docker container is used for testing on GCB.

FROM golang:1.15 AS gobuilder

ENV GO111MODULE on
ENV GOBIN /gobin

# Install other Go tools tests depend on
RUN mkdir -p /scratch/build
ADD build/all.bash /scratch/build/all.bash
RUN /scratch/build/all.bash setup_env

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

RUN apt-get update && apt-get install -y libnss3 libgtk-3-dev libxss1 libasound2 xvfb libsecret-1-0

WORKDIR /workspace
ENTRYPOINT ["build/all.bash"]
