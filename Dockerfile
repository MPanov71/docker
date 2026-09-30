#--- For Oracle Linux development ----
FROM oraclelinux:9

RUN dnf update -y && \
    dnf install -y gcc gcc-c++ make \
    sqlite-devel \
    boost-devel \
    && dnf clean all

COPY compile.sh ./
RUN chmod +x ./compile.sh

ENTRYPOINT ["./compile.sh"]


